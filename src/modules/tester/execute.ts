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
  READ_ONLY_METHODS,
  type ExecuteInput,
  type ExecuteResponse,
} from "./schemas";

const MAX_RESPONSE_TO_CLIENT = 1024 * 1024; // 1 MB
const MAX_STORED_BODY = 100 * 1024; // 100 KB
const MAX_STORED_REQUEST_BODY = 20 * 1024;

export type ExecuteOutcome =
  | { ok: true; response: ExecuteResponse }
  | { ok: false; status: number; error: string };

const DEFAULT_CONTENT_TYPE = {
  json: "application/json",
  xml: "application/xml",
  text: "text/plain",
  form: "application/x-www-form-urlencoded",
} as const;

export async function executeRequest(input: ExecuteInput): Promise<ExecuteOutcome> {
  // 1. Sessão, ambiente (RLS), ambiente ativo, papel
  const found = await getRunnableEnvironment(input.environmentId);
  if (!found.ok) return found;
  const { supabase, user, env } = found.ctx;

  // 2. Métodos que alteram dados exigem liberação explícita no ambiente
  const isWrite = !READ_ONLY_METHODS.includes(input.method);
  if (isWrite && !env.allow_write_methods) {
    return {
      ok: false,
      status: 403,
      error: `O ambiente "${env.name}" está em modo somente leitura. Habilite métodos de escrita em Configurações para usar ${input.method}.`,
    };
  }

  // 3. URL final: sempre dentro da URL base cadastrada (nunca URL arbitrária)
  const built = buildTargetUrl(env, input.path);
  if (!built.ok) return built;
  const target = built.url;
  for (const { key, value, enabled } of input.query) {
    if (enabled && key.trim()) target.searchParams.append(key.trim(), value);
  }

  // 4. Headers + corpo
  const headers: Record<string, string> = {
    Accept: "application/json, application/xml;q=0.9, text/plain;q=0.8, */*;q=0.5",
    "User-Agent": "FluigIntegrationStudio/1.0",
  };
  const setHeader = (name: string, value: string) => {
    for (const existing of Object.keys(headers)) {
      if (existing.toLowerCase() === name.toLowerCase()) delete headers[existing];
    }
    headers[name] = value;
  };
  for (const { key, value, enabled } of input.headers) {
    if (enabled && key.trim()) setHeader(key.trim(), value);
  }

  const hasBody =
    input.bodyType !== "none" &&
    input.body !== undefined &&
    input.body !== "" &&
    !["GET", "HEAD"].includes(input.method);
  const body = hasBody ? input.body : undefined;
  if (hasBody && input.bodyType !== "none") {
    const hasContentType = Object.keys(headers).some((h) => h.toLowerCase() === "content-type");
    if (!hasContentType) setHeader("Content-Type", DEFAULT_CONTENT_TYPE[input.bodyType]);
  }

  // 5. Autenticação do ambiente (credenciais descriptografadas só em memória)
  const loaded = await loadCredentials(env);
  if (!loaded.ok) return loaded;
  applyAuthHeaders({
    authType: env.auth_type,
    credentials: loaded.credentials,
    setHeader,
    method: input.method,
    url: target,
    formParams: input.bodyType === "form" && body ? [...new URLSearchParams(body).entries()] : undefined,
  });

  // 6. Execução
  const started = Date.now();
  let response: ExecuteResponse;
  try {
    const result = await safeRequest({ url: target, method: input.method, headers, body });
    const durationMs = Date.now() - started;
    const text = decodeBody(result.body, result.headers["content-type"]);
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
    };
  }

  // 7. Histórico (auditoria). Falha aqui nunca bloqueia a resposta.
  const { data: saved } = await supabase
    .from("request_history")
    .insert({
    workspace_id: env.workspace_id,
    user_id: user.id,
    environment_id: env.id,
    kind: "rest",
    method: input.method,
    url: response.url,
    request_headers: maskHeaders(headers),
    request_body: body ? body.slice(0, MAX_STORED_REQUEST_BODY) : null,
    status_code: response.status,
    response_headers: maskHeaders(response.headers),
    response_body: response.body.slice(0, MAX_STORED_BODY),
    duration_ms: response.durationMs,
    error: response.error ?? null,
    })
    .select("id")
    .single();

  return { ok: true, response: { ...response, historyId: (saved?.id as string | undefined) ?? null } };
}
