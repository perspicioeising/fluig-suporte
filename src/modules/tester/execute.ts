import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptJson } from "@/lib/security/crypto";
import { buildOAuth1Header, type OAuth1Credentials } from "@/lib/security/oauth1";
import { SsrfError, assertSafeHost, safeRequest } from "@/lib/security/ssrf";
import { WRITE_ROLES } from "@/lib/workspace";
import type { AuthType } from "@/modules/environments/constants";
import {
  READ_ONLY_METHODS,
  type ExecuteInput,
  type ExecuteResponse,
} from "./schemas";

const MAX_RESPONSE_TO_CLIENT = 1024 * 1024; // 1 MB
const MAX_STORED_BODY = 100 * 1024; // 100 KB
const MAX_STORED_REQUEST_BODY = 20 * 1024;

const SENSITIVE_NAME = /authorization|cookie|token|secret|password|passwd|api[-_]?key|x-auth|signature/i;

type Credentials =
  | { username: string; password: string }
  | { token: string }
  | { headerName: string; headerValue: string }
  | OAuth1Credentials;

export type ExecuteOutcome =
  | { ok: true; response: ExecuteResponse }
  | { ok: false; status: number; error: string };

function friendlyNetworkError(error: unknown): string {
  if (error instanceof SsrfError) return error.message;
  const code = (error as NodeJS.ErrnoException)?.code;
  const message = error instanceof Error ? error.message : String(error);
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "Host não encontrado (falha de DNS).";
    case "ECONNREFUSED":
      return "Conexão recusada pelo servidor.";
    case "ECONNRESET":
      return "Conexão encerrada pelo servidor.";
    case "ETIMEDOUT":
      return "Tempo limite excedido.";
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "CERT_HAS_EXPIRED":
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return "Falha na verificação do certificado TLS do servidor.";
  }
  return message === "ETIMEDOUT" ? "Tempo limite excedido." : "Falha ao conectar ao servidor.";
}

function maskHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k, SENSITIVE_NAME.test(k) ? "***" : v]),
  );
}

function maskUrl(url: URL) {
  const copy = new URL(url.toString());
  for (const key of [...copy.searchParams.keys()]) {
    if (SENSITIVE_NAME.test(key)) copy.searchParams.set(key, "***");
  }
  return copy.toString();
}

const TEXTUAL = /json|xml|text|javascript|html|csv|x-www-form-urlencoded|yaml|svg/i;

function decodeBody(body: Buffer, contentType: string | undefined) {
  if (body.length === 0) return { text: "", binary: false };
  if (contentType && !TEXTUAL.test(contentType)) {
    return { text: `[conteúdo binário: ${contentType}, ${body.length} bytes]`, binary: true };
  }
  return { text: body.toString("utf8"), binary: false };
}

const DEFAULT_CONTENT_TYPE = {
  json: "application/json",
  xml: "application/xml",
  text: "text/plain",
  form: "application/x-www-form-urlencoded",
} as const;

export async function executeRequest(input: ExecuteInput): Promise<ExecuteOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Sessão expirada. Entre novamente." };

  // 1. Ambiente (RLS: só enxerga ambientes dos seus workspaces)
  const { data: env } = await supabase
    .from("fluig_environments")
    .select("id, workspace_id, name, base_url, auth_type, is_active, allow_write_methods")
    .eq("id", input.environmentId)
    .maybeSingle();
  if (!env) return { ok: false, status: 404, error: "Ambiente não encontrado." };
  if (!env.is_active) return { ok: false, status: 403, error: "Este ambiente está inativo." };

  // 2. Permissão do papel (viewer não executa)
  const { data: canRun } = await supabase.rpc("has_workspace_role", {
    ws: env.workspace_id,
    allowed_roles: [...WRITE_ROLES],
  });
  if (!canRun) {
    return { ok: false, status: 403, error: "Seu papel neste workspace não permite executar requisições." };
  }

  // 3. Métodos que alteram dados exigem liberação explícita no ambiente
  const isWrite = !READ_ONLY_METHODS.includes(input.method);
  if (isWrite && !env.allow_write_methods) {
    return {
      ok: false,
      status: 403,
      error: `O ambiente "${env.name}" está em modo somente leitura. Habilite métodos de escrita em Configurações para usar ${input.method}.`,
    };
  }

  // 4. URL final: sempre dentro da URL base cadastrada (nunca URL arbitrária)
  let target: URL;
  try {
    const base = new URL(env.base_url);
    target = new URL(`${env.base_url}${input.path}`);
    // Caminho do contexto do ambiente sem barra final ("" quando a base é a raiz).
    const basePath = base.pathname.replace(/\/+$/, "");
    const insideBase =
      target.origin === base.origin &&
      (basePath === "" ||
        target.pathname === basePath ||
        target.pathname.startsWith(`${basePath}/`));
    if (!insideBase) {
      return { ok: false, status: 400, error: "O caminho informado sai da URL base do ambiente." };
    }
    assertSafeHost(target);
  } catch (error) {
    return { ok: false, status: 400, error: error instanceof SsrfError ? error.message : "URL inválida." };
  }
  for (const { key, value, enabled } of input.query) {
    if (enabled && key.trim()) target.searchParams.append(key.trim(), value);
  }

  // 5. Headers + corpo
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

  const hasBody = input.bodyType !== "none" && input.body !== undefined && input.body !== "" && !["GET", "HEAD"].includes(input.method);
  const body = hasBody ? input.body : undefined;
  if (hasBody && input.bodyType !== "none") {
    const hasContentType = Object.keys(headers).some((h) => h.toLowerCase() === "content-type");
    if (!hasContentType) setHeader("Content-Type", DEFAULT_CONTENT_TYPE[input.bodyType]);
  }

  // 6. Autenticação do ambiente (credenciais descriptografadas só em memória)
  const authType = env.auth_type as AuthType;
  if (authType !== "none") {
    const { data: secret } = await createAdminClient()
      .from("fluig_environments")
      .select("encrypted_credentials")
      .eq("id", env.id)
      .eq("workspace_id", env.workspace_id)
      .maybeSingle();

    if (!secret?.encrypted_credentials) {
      return { ok: false, status: 400, error: `O ambiente "${env.name}" não tem credenciais cadastradas.` };
    }

    let credentials: Credentials;
    try {
      credentials = decryptJson<Credentials>(secret.encrypted_credentials);
    } catch {
      return { ok: false, status: 500, error: "Não foi possível ler as credenciais do ambiente. Cadastre-as novamente." };
    }

    if (authType === "basic" && "username" in credentials) {
      setHeader("Authorization", `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`);
    } else if (authType === "bearer" && "token" in credentials && !("consumerKey" in credentials)) {
      setHeader("Authorization", `Bearer ${credentials.token}`);
    } else if (authType === "header" && "headerName" in credentials) {
      setHeader(credentials.headerName, credentials.headerValue);
    } else if (authType === "oauth1" && "consumerKey" in credentials) {
      const formParams =
        input.bodyType === "form" && body
          ? [...new URLSearchParams(body).entries()]
          : undefined;
      setHeader(
        "Authorization",
        buildOAuth1Header({ method: input.method, url: target, credentials, formParams }),
      );
    }
  }

  // 7. Execução
  const started = Date.now();
  let response: ExecuteResponse;
  try {
    const result = await safeRequest({ url: target, method: input.method, headers, body });
    const durationMs = Date.now() - started;
    const contentType = result.headers["content-type"];
    const decoded = decodeBody(result.body, contentType);

    const overLimit = decoded.text.length > MAX_RESPONSE_TO_CLIENT;
    response = {
      status: result.status,
      statusText: result.statusText,
      durationMs,
      sizeBytes: result.body.length,
      headers: result.headers,
      body: overLimit ? decoded.text.slice(0, MAX_RESPONSE_TO_CLIENT) : decoded.text,
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

  // 8. Histórico (auditoria). Falha aqui nunca bloqueia a resposta.
  await supabase.from("request_history").insert({
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
  });

  return { ok: true, response };
}
