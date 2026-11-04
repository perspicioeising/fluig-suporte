import { HTTP_METHODS, type BodyType, type HttpMethod, type KeyValue } from "@/modules/tester/schemas";
import type { TesterPrefill } from "@/modules/builder/tester-link";

// Valores mascarados ao gravar o histórico (credenciais): não fazem sentido de volta no Tester.
const MASKED = "***";
const MANAGED_HEADERS = /^(authorization|content-type|accept|content-length|host|cookie|user-agent)$/i;

function bodyTypeOf(headers: Record<string, string>, body: string | null): BodyType {
  if (!body) return "none";
  const ct = Object.entries(headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  if (/json/i.test(ct)) return "json";
  if (/xml/i.test(ct)) return "xml";
  if (/x-www-form-urlencoded/i.test(ct)) return "form";
  return /^\s*[{[]/.test(body) ? "json" : "text";
}

/**
 * Converte um registro REST do histórico em pré-preenchimento do API Tester.
 * O caminho é relativo à URL base do ambiente; se o registro não pertence a ela, retorna null.
 * Valores mascarados ("***") ficam vazios e desabilitados para o usuário preencher.
 */
export function historyToPrefill(
  item: {
    kind: string;
    method: string;
    url: string;
    environment_id: string | null;
    request_headers: Record<string, string>;
    request_body: string | null;
  },
  envBaseUrl: string | null,
): TesterPrefill | null {
  if (item.kind !== "rest" || !envBaseUrl || !item.environment_id) return null;
  const method = HTTP_METHODS.find((m) => m === item.method.toUpperCase()) as HttpMethod | undefined;
  if (!method) return null;

  let target: URL;
  let base: URL;
  try {
    target = new URL(item.url);
    base = new URL(envBaseUrl);
  } catch {
    return null;
  }
  if (target.origin !== base.origin) return null;

  const basePath = base.pathname.replace(/\/+$/, "");
  if (basePath && !target.pathname.startsWith(`${basePath}/`) && target.pathname !== basePath) return null;
  const rawPath = target.pathname.slice(basePath.length) || "/";
  let path = rawPath;
  try {
    path = decodeURI(rawPath);
  } catch {
    /* mantém codificado */
  }

  const row = (key: string, value: string): KeyValue =>
    value === MASKED ? { key, value: "", enabled: false } : { key, value, enabled: true };

  const query = [...target.searchParams.entries()].slice(0, 50).map(([k, v]) => row(k, v));
  const headers = Object.entries(item.request_headers ?? {})
    .filter(([k]) => !MANAGED_HEADERS.test(k))
    .slice(0, 50)
    .map(([k, v]) => row(k, v));

  return {
    environmentId: item.environment_id,
    method,
    path,
    query,
    headers,
    bodyType: bodyTypeOf(item.request_headers ?? {}, item.request_body),
    body: item.request_body ?? "",
  };
}
