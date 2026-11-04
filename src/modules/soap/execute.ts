import "server-only";
import { safeRequest } from "@/lib/security/ssrf";
import {
  applyAuthHeaders,
  buildTargetUrl,
  decodeBody,
  friendlyNetworkError,
  getRunnableEnvironment,
  loadCredentials,
  maskHeaders,
  maskUrl,
} from "@/modules/environments/runtime";
import {
  applyEnvPlaceholders,
  hasEnvPlaceholders,
  inspectEnvelope,
  maskSensitiveXml,
  parseSoapFault,
  prettyXml,
} from "./envelope";
import { isReadOnlySoapName } from "./guard";
import type { SoapExecuteInput, SoapExecuteResponse } from "./schemas";

const MAX_RESPONSE_TO_CLIENT = 1024 * 1024;
const MAX_STORED_BODY = 100 * 1024;
const MAX_STORED_REQUEST = 20 * 1024;

export type SoapOutcome =
  | { ok: true; response: SoapExecuteResponse }
  | { ok: false; status: number; error: string };

export async function executeSoap(input: SoapExecuteInput): Promise<SoapOutcome> {
  // 1. Sessão, ambiente, papel
  const found = await getRunnableEnvironment(input.environmentId);
  if (!found.ok) return found;
  const { supabase, user, env } = found.ctx;

  // 2. Envelope válido (e o que ele realmente vai executar)
  const info = inspectEnvelope(input.envelope);
  if (!info.ok) return { ok: false, status: 400, error: info.error };

  // 3. Endpoint e SOAPAction: da operação importada (banco, via RLS) ou informados
  let endpointPath = input.endpointPath;
  let soapAction = input.soapAction ?? "";
  if (input.operationId) {
    const { data: op } = await supabase
      .from("soap_operations")
      .select("soap_action, input_schema")
      .eq("id", input.operationId)
      .maybeSingle();
    if (!op) return { ok: false, status: 404, error: "Operação não encontrada." };

    const declared = (op.input_schema as { endpoint?: string | null } | null)?.endpoint;
    if (!declared) {
      return { ok: false, status: 400, error: "A operação não tem endpoint no WSDL. Informe o caminho manualmente." };
    }
    try {
      const u = new URL(declared);
      endpointPath = `${u.pathname}${u.search}`; // só o caminho: o host é sempre o do ambiente
    } catch {
      return { ok: false, status: 400, error: "Endpoint inválido no WSDL." };
    }
    soapAction = (op.soap_action as string | null) ?? "";
  }
  if (!endpointPath) return { ok: false, status: 400, error: "Endpoint não informado." };

  // 4. Escrita: SOAP é sempre POST, então classificamos pelo NOME da operação
  //    (elemento do Body e SOAPAction). Na dúvida, exige ambiente com escrita liberada.
  const readOnly =
    isReadOnlySoapName(info.bodyElement) && (soapAction === "" || isReadOnlySoapName(soapAction));
  if (!readOnly && !env.allow_write_methods) {
    return {
      ok: false,
      status: 403,
      error: `A operação "${info.bodyElement}" não é reconhecida como consulta e o ambiente "${env.name}" está em modo somente leitura. Habilite métodos de escrita em Configurações para executá-la.`,
    };
  }

  // 5. URL confinada ao ambiente
  const built = buildTargetUrl(env, endpointPath);
  if (!built.ok) return built;
  const target = built.url;

  // 6. Credenciais: marcadores {{ENV_*}} substituídos aqui, no servidor
  const loaded = await loadCredentials(env);
  if (!loaded.ok && hasEnvPlaceholders(input.envelope)) return loaded;

  let envelope = input.envelope;
  if (hasEnvPlaceholders(envelope)) {
    const credentials = loaded.ok ? loaded.credentials : null;
    if (env.auth_type !== "basic" || !credentials || !("username" in credentials)) {
      return {
        ok: false,
        status: 400,
        error: "Os marcadores {{ENV_USERNAME}}/{{ENV_PASSWORD}} exigem um ambiente com autenticação Basic e credenciais cadastradas.",
      };
    }
    envelope = applyEnvPlaceholders(envelope, credentials);
  }

  // 7. Headers
  const headers: Record<string, string> = {
    Accept: "text/xml, application/soap+xml, */*",
    "User-Agent": "FluigIntegrationStudio/1.0",
  };
  const setHeader = (name: string, value: string) => {
    headers[name] = value;
  };
  if (info.soapVersion === "1.2") {
    setHeader("Content-Type", `application/soap+xml; charset=utf-8${soapAction ? `; action="${soapAction}"` : ""}`);
  } else {
    setHeader("Content-Type", "text/xml; charset=utf-8");
    setHeader("SOAPAction", `"${soapAction}"`);
  }
  // Basic é usado via marcadores no envelope (padrão do Fluig); os demais tipos vão em headers.
  if (env.auth_type !== "basic" && loaded.ok) {
    applyAuthHeaders({
      authType: env.auth_type,
      credentials: loaded.credentials,
      setHeader,
      method: "POST",
      url: target,
    });
  }

  // 8. Execução
  const started = Date.now();
  let response: SoapExecuteResponse;
  try {
    const result = await safeRequest({ url: target, method: "POST", headers, body: envelope, timeoutMs: 45_000 });
    const durationMs = Date.now() - started;
    const raw = decodeBody(result.body, result.headers["content-type"]);
    const looksXml = /xml/i.test(result.headers["content-type"] ?? "") || raw.trimStart().startsWith("<");
    const text = looksXml ? prettyXml(raw) : raw;
    const overLimit = text.length > MAX_RESPONSE_TO_CLIENT;

    response = {
      status: result.status,
      statusText: result.statusText,
      durationMs,
      sizeBytes: result.body.length,
      headers: result.headers,
      body: overLimit ? text.slice(0, MAX_RESPONSE_TO_CLIENT) : text,
      truncated: result.truncated || overLimit,
      url: maskUrl(target),
      operation: info.bodyElement,
      fault: looksXml ? parseSoapFault(raw) : null,
    };
  } catch (error) {
    response = {
      status: null,
      statusText: "",
      durationMs: Date.now() - started,
      sizeBytes: 0,
      headers: {},
      body: "",
      truncated: false,
      error: friendlyNetworkError(error),
      url: maskUrl(target),
      operation: info.bodyElement,
      fault: null,
    };
  }

  // 9. Histórico: guarda o envelope ORIGINAL (com marcadores) e mascarado.
  const { data: saved } = await supabase
    .from("request_history")
    .insert({
    workspace_id: env.workspace_id,
    user_id: user.id,
    environment_id: env.id,
    kind: "soap",
    method: "SOAP",
    url: `${response.url} :: ${info.bodyElement}`,
    request_headers: maskHeaders(headers),
    request_body: maskSensitiveXml(input.envelope).slice(0, MAX_STORED_REQUEST),
    status_code: response.status,
    response_headers: maskHeaders(response.headers),
    response_body: response.body.slice(0, MAX_STORED_BODY),
    duration_ms: response.durationMs,
    error: response.error ?? response.fault?.message ?? null,
    })
    .select("id")
    .single();

  return { ok: true, response: { ...response, historyId: (saved?.id as string | undefined) ?? null } };
}
