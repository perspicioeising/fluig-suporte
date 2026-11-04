import * as z from "zod";
import type { CatalogParameter } from "@/modules/catalog/types";
import {
  BODY_TYPES,
  HTTP_METHODS,
  KeyValueSchema,
  type BodyType,
  type HttpMethod,
  type KeyValue,
} from "@/modules/tester/schemas";

/**
 * Ponte Construtor/Catálogo -> API Tester: leva ambiente, método, caminho, parâmetros,
 * headers e corpo já preenchidos, via query string (link compartilhável, sem estado oculto).
 */

export type TesterPrefill = {
  environmentId?: string;
  method: HttpMethod;
  /** Pode conter {param}: o Tester avisa e bloqueia o envio até serem preenchidos. */
  path: string;
  query: KeyValue[];
  headers: KeyValue[];
  bodyType: BodyType;
  body: string;
};

// Headers que o app já controla (credenciais do ambiente, tipo de conteúdo...).
const MANAGED_HEADERS = /^(authorization|content-type|accept|content-length|host|cookie|user-agent)$/i;

const MAX_HREF_LENGTH = 6500;
const PATH_PATTERN = /^\/(?!\/)[^\\\u0000-\u001f]{0,1999}$/;

function hintOf(p: CatalogParameter): string | undefined {
  const text = [p.data_type, p.description].filter(Boolean).join(" · ");
  return text ? text.slice(0, 300) : undefined;
}

/**
 * Parâmetros de query e headers DOCUMENTADOS, como linhas prontas para o Tester:
 * os obrigatórios entram habilitados; os opcionais entram desabilitados (para ligar com um clique).
 * Obrigatórios primeiro.
 */
export function documentedRows(parameters: CatalogParameter[]): { query: KeyValue[]; headers: KeyValue[] } {
  const rowsFor = (location: "query" | "header") =>
    parameters
      .filter((p) => p.direction === "input" && p.location === location)
      .filter((p) => location !== "header" || !MANAGED_HEADERS.test(p.name))
      .map<KeyValue>((p) => ({
        key: p.name,
        value: p.example ?? "",
        enabled: p.is_required,
        required: p.is_required,
        hint: hintOf(p),
      }))
      .sort((a, b) => Number(b.required) - Number(a.required));

  return { query: rowsFor("query"), headers: rowsFor("header") };
}

export function buildTesterHref(prefill: TesterPrefill): { href: string; bodyDropped: boolean } {
  const params = new URLSearchParams();
  if (prefill.environmentId) params.set("env", prefill.environmentId);
  params.set("method", prefill.method);
  params.set("path", prefill.path);
  if (prefill.query.length > 0) params.set("q", JSON.stringify(prefill.query));
  if (prefill.headers.length > 0) params.set("h", JSON.stringify(prefill.headers));
  if (prefill.bodyType !== "none") params.set("bt", prefill.bodyType);
  if (prefill.body) params.set("body", prefill.body);

  let href = `/tester?${params.toString()}`;
  let bodyDropped = false;
  // URLs muito longas quebram em proxies/navegadores: nesse caso o corpo fica de fora.
  if (href.length > MAX_HREF_LENGTH && prefill.body) {
    params.delete("body");
    href = `/tester?${params.toString()}`;
    bodyDropped = true;
  }
  return { href, bodyDropped };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function parseRows(raw: string | undefined): KeyValue[] {
  if (!raw) return [];
  try {
    const parsed = z.array(KeyValueSchema).max(50).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Lê e valida (entrada não confiável) os parâmetros de /tester. Retorna null se não houver pré-preenchimento válido. */
export function parseTesterPrefill(raw: Record<string, string | string[] | undefined>): TesterPrefill | null {
  const method = HTTP_METHODS.find((m) => m === first(raw.method)?.toUpperCase());
  const path = first(raw.path);
  if (!method || !path || !PATH_PATTERN.test(path)) return null;

  const body = (first(raw.body) ?? "").slice(0, 200_000);
  const requestedType = first(raw.bt);
  const bodyType = (BODY_TYPES as readonly string[]).includes(requestedType ?? "")
    ? (requestedType as BodyType)
    : body
      ? "json"
      : "none";

  const environmentId = z.uuid().safeParse(first(raw.env)).success ? first(raw.env) : undefined;

  return {
    environmentId,
    method,
    path,
    query: parseRows(first(raw.q)),
    headers: parseRows(first(raw.h)),
    bodyType,
    body,
  };
}
