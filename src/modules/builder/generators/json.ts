import type { CatalogEntry, CatalogParameter } from "@/modules/catalog/types";
import { parseExamplesClient } from "../examples";
import type { Snippet } from "../types";
import { tryNormalizeJson } from "./common";

const SCALAR_SAMPLE = (type: string): unknown => {
  const t = type.toLowerCase();
  if (t.endsWith("[]")) return [];
  if (/^(integer|int|long|short)\b/.test(t)) return 0;
  if (/^(number|double|float|decimal)\b/.test(t)) return 0;
  if (t.startsWith("boolean")) return false;
  if (t.startsWith("string")) return "string";
  return {}; // objeto referenciado: a estrutura não foi detalhada no catálogo
};

/** Esqueleto do corpo a partir dos campos documentados no Swagger (REST novo). */
function skeletonFromSwagger(parameters: CatalogParameter[]): Record<string, unknown> | null {
  const bodyParams = parameters.filter((p) => p.direction === "input" && p.location === "body");
  if (bodyParams.length === 0) return null;

  const [first, ...rest] = bodyParams;
  const firstIsContainer = !/^(string|integer|int|long|number|boolean|file)\b/i.test(first.data_type ?? "");
  const fields = firstIsContainer ? rest : bodyParams;
  if (fields.length === 0) return null;

  return Object.fromEntries(fields.map((f) => [f.name, SCALAR_SAMPLE(f.data_type ?? "string")]));
}

export type BodySuggestion = {
  /** Corpo inicial sugerido ("" se não houver). */
  body: string;
  source: "documentacao" | "swagger" | "nenhum";
  /** Exemplo exatamente como está na documentação (pode conter comentários). */
  verbatim?: string;
};

export function suggestBody(entry: CatalogEntry, parameters: CatalogParameter[]): BodySuggestion {
  // 1. Exemplo documentado (REST antigo): aproveita se for possível normalizar para JSON válido.
  const requestExample = parseExamplesClient(entry.examples).find(
    (e) => /request/i.test(e.title ?? "") || /requisi/i.test(e.title ?? ""),
  );
  if (requestExample) {
    const normalized = tryNormalizeJson(requestExample.code);
    return {
      body: normalized ?? requestExample.code,
      source: "documentacao",
      verbatim: requestExample.code,
    };
  }

  // 2. Campos do Swagger (REST novo)
  const skeleton = skeletonFromSwagger(parameters);
  if (skeleton) return { body: JSON.stringify(skeleton, null, 2), source: "swagger" };

  return { body: "", source: "nenhum" };
}

export function generateJsonSnippets(entry: CatalogEntry, parameters: CatalogParameter[]): Snippet[] {
  const suggestion = suggestBody(entry, parameters);
  if (suggestion.source === "nenhum") return [];

  const valid = (() => {
    try {
      JSON.parse(suggestion.body);
      return true;
    } catch {
      return false;
    }
  })();

  const notes =
    suggestion.source === "swagger"
      ? ["Esqueleto montado a partir dos campos do Swagger. Tipos que referenciam outros objetos aparecem como {}; consulte o catálogo."]
      : valid
        ? ["Exemplo da documentação oficial, normalizado para JSON válido (comentários removidos)."]
        : ["Exemplo copiado da documentação oficial. Ele contém comentários ou vírgulas ausentes e precisa ser ajustado antes de enviar."];

  const out: Snippet[] = [
    { id: "json", label: "JSON (corpo)", language: "json", code: suggestion.body, notes },
  ];
  return out;
}
