import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptJson } from "@/lib/security/crypto";
import { buildOAuth1Header, type OAuth1Credentials } from "@/lib/security/oauth1";
import { SsrfError, assertSafeHost } from "@/lib/security/ssrf";
import { WRITE_ROLES } from "@/lib/workspace";
import type { AuthType } from "./constants";

/**
 * Regras comuns a tudo que executa chamadas contra um ambiente Fluig
 * (API Tester, Laboratório SOAP): autorização, URL confinada à base do
 * ambiente e aplicação das credenciais (que só existem em memória).
 */

export type RunnableEnvironment = {
  id: string;
  workspace_id: string;
  name: string;
  base_url: string;
  auth_type: AuthType;
  allow_write_methods: boolean;
};

export type EnvContext = {
  supabase: SupabaseClient;
  user: User;
  env: RunnableEnvironment;
};

export type Failure = { ok: false; status: number; error: string };

export type Credentials =
  | { username: string; password: string }
  | { token: string }
  | { headerName: string; headerValue: string }
  | OAuth1Credentials;

/** Valida sessão, existência (RLS), ambiente ativo e papel que permite executar. */
export async function getRunnableEnvironment(
  environmentId: string,
): Promise<{ ok: true; ctx: EnvContext } | Failure> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Sessão expirada. Entre novamente." };

  const { data: env } = await supabase
    .from("fluig_environments")
    .select("id, workspace_id, name, base_url, auth_type, is_active, allow_write_methods")
    .eq("id", environmentId)
    .maybeSingle();
  if (!env) return { ok: false, status: 404, error: "Ambiente não encontrado." };
  if (!env.is_active) return { ok: false, status: 403, error: "Este ambiente está inativo." };

  const { data: canRun } = await supabase.rpc("has_workspace_role", {
    ws: env.workspace_id,
    allowed_roles: [...WRITE_ROLES],
  });
  if (!canRun) {
    return { ok: false, status: 403, error: "Seu papel neste workspace não permite executar requisições." };
  }

  return { ok: true, ctx: { supabase, user, env: env as RunnableEnvironment } };
}

/**
 * Monta a URL final SEMPRE dentro da URL base do ambiente.
 * `path` pode ser um caminho relativo ao ambiente ("/webdesk/X?wsdl") ou um caminho
 * absoluto que já inclui o contexto da base ("/ctx/webdesk/X").
 */
export function buildTargetUrl(
  env: Pick<RunnableEnvironment, "base_url">,
  path: string,
): { ok: true; url: URL } | Failure {
  try {
    const base = new URL(env.base_url);
    const basePath = base.pathname.replace(/\/+$/, "");
    const alreadyPrefixed = basePath !== "" && (path === basePath || path.startsWith(`${basePath}/`));
    const url = new URL(alreadyPrefixed ? `${base.origin}${path}` : `${env.base_url}${path}`);

    const inside =
      url.origin === base.origin &&
      (basePath === "" || url.pathname === basePath || url.pathname.startsWith(`${basePath}/`));
    if (!inside) {
      return { ok: false, status: 400, error: "O caminho informado sai da URL base do ambiente." };
    }
    assertSafeHost(url);
    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof SsrfError ? error.message : "URL inválida.",
    };
  }
}

/** Lê e descriptografa as credenciais do ambiente (service role; só em memória). */
export async function loadCredentials(
  env: RunnableEnvironment,
): Promise<{ ok: true; credentials: Credentials | null } | Failure> {
  if (env.auth_type === "none") return { ok: true, credentials: null };

  const { data } = await createAdminClient()
    .from("fluig_environments")
    .select("encrypted_credentials")
    .eq("id", env.id)
    .eq("workspace_id", env.workspace_id)
    .maybeSingle();

  if (!data?.encrypted_credentials) {
    return { ok: false, status: 400, error: `O ambiente "${env.name}" não tem credenciais cadastradas.` };
  }
  try {
    return { ok: true, credentials: decryptJson<Credentials>(data.encrypted_credentials) };
  } catch {
    return {
      ok: false,
      status: 500,
      error: "Não foi possível ler as credenciais do ambiente. Cadastre-as novamente.",
    };
  }
}

/** Aplica a autenticação do ambiente nos headers. */
export function applyAuthHeaders(options: {
  authType: AuthType;
  credentials: Credentials | null;
  setHeader: (name: string, value: string) => void;
  method: string;
  url: URL;
  formParams?: [string, string][];
}) {
  const { authType, credentials, setHeader, method, url, formParams } = options;
  if (!credentials) return;

  if (authType === "basic" && "username" in credentials) {
    setHeader(
      "Authorization",
      `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
    );
  } else if (authType === "bearer" && "token" in credentials && !("consumerKey" in credentials)) {
    setHeader("Authorization", `Bearer ${credentials.token}`);
  } else if (authType === "header" && "headerName" in credentials) {
    setHeader(credentials.headerName, credentials.headerValue);
  } else if (authType === "oauth1" && "consumerKey" in credentials) {
    setHeader("Authorization", buildOAuth1Header({ method, url, credentials, formParams }));
  }
}

const SENSITIVE_NAME = /authorization|cookie|token|secret|password|passwd|api[-_]?key|x-auth|signature/i;

export function maskHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k, SENSITIVE_NAME.test(k) ? "***" : v]),
  );
}

export function maskUrl(url: URL) {
  const copy = new URL(url.toString());
  for (const key of [...copy.searchParams.keys()]) {
    if (SENSITIVE_NAME.test(key)) copy.searchParams.set(key, "***");
  }
  return copy.toString();
}

const TEXTUAL = /json|xml|text|javascript|html|csv|x-www-form-urlencoded|yaml|svg/i;

export function decodeBody(body: Buffer, contentType: string | undefined) {
  if (body.length === 0) return "";
  if (contentType && !TEXTUAL.test(contentType)) {
    return `[conteúdo binário: ${contentType}, ${body.length} bytes]`;
  }
  return body.toString("utf8");
}

export function friendlyNetworkError(error: unknown): string {
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
