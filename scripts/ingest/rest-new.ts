import { fetchJson, fetchText, FetchError } from "./lib/http";
import {
  HTTP_METHODS,
  type NormalizedEntry,
  type NormalizedParameter,
  type ParseResult,
} from "./lib/types";

export const REST_NEW_SOURCE_SLUG = "api-fluig-latest";
const BASE = "https://api.fluig.com/latest";

/* --------------------------- Tipos do Swagger 2.0 -------------------------- */

type Schema = {
  $ref?: string;
  type?: string;
  format?: string;
  description?: string;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  enum?: unknown[];
};

type SwaggerParam = {
  $ref?: string;
  name?: string;
  in?: string;
  description?: string;
  required?: boolean;
  type?: string;
  format?: string;
  items?: Schema;
  schema?: Schema;
  enum?: unknown[];
};

type Operation = {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  deprecated?: boolean;
  parameters?: SwaggerParam[];
  responses?: Record<string, { description?: string; schema?: Schema }>;
};

type SwaggerSpec = {
  info?: { title?: string; description?: string; version?: string };
  basePath?: string;
  paths?: Record<string, Record<string, unknown>>;
  definitions?: Record<string, Schema>;
  parameters?: Record<string, SwaggerParam>;
};

type Card = { enable: boolean; title: string; link: string };

/* ------------------------------- Helpers ---------------------------------- */

const clean = (value: string | undefined | null) => {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : null;
};

function refName(ref: string) {
  return ref.split("/").pop() ?? ref;
}

function typeLabel(schema: Schema | undefined): string | null {
  if (!schema) return null;
  if (schema.$ref) return refName(schema.$ref);
  if (schema.type === "array") return `${typeLabel(schema.items) ?? "any"}[]`;
  if (schema.type) {
    return schema.format ? `${schema.type} (${schema.format})` : schema.type;
  }
  return null;
}

function resolveParam(param: SwaggerParam, spec: SwaggerSpec): SwaggerParam {
  if (param.$ref) {
    const resolved = spec.parameters?.[refName(param.$ref)];
    if (resolved) return resolved;
  }
  return param;
}

/** Propriedades de primeiro nível de um schema referenciado (sem inventar nada). */
function expandSchema(
  schema: Schema | undefined,
  spec: SwaggerSpec,
  direction: "input" | "output",
  location: "body" | "return",
): NormalizedParameter[] {
  if (!schema) return [];
  const target =
    schema.type === "array" && schema.items ? schema.items : schema;
  const definition = target.$ref
    ? spec.definitions?.[refName(target.$ref)]
    : target;
  if (!definition?.properties) return [];

  const required = new Set(definition.required ?? []);
  return Object.entries(definition.properties)
    .slice(0, 80)
    .map(([name, prop]) => ({
      direction,
      location,
      name,
      data_type: typeLabel(prop),
      is_required: required.has(name),
      description: clean(prop.description),
      example: null,
    }));
}

const LOCATION_MAP: Record<string, NormalizedParameter["location"]> = {
  path: "path",
  query: "query",
  header: "header",
  body: "body",
  formData: "body",
};

/* -------------------------------- Parser ---------------------------------- */

export function parseSwagger(apiKey: string, spec: SwaggerSpec): ParseResult {
  const entries: NormalizedEntry[] = [];
  const warnings: string[] = [];

  const apiTitle = clean(spec.info?.title) ?? apiKey;
  const basePath = (spec.basePath ?? "").replace(/\/$/, "");
  const documentUrl = `${BASE}/${apiKey}/swagger-ui/`;

  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    const pathLevelParams = (item["parameters"] as SwaggerParam[] | undefined) ?? [];

    for (const method of HTTP_METHODS) {
      const operation = item[method.toLowerCase()] as Operation | undefined;
      if (!operation) continue;

      const parameters: NormalizedParameter[] = [];
      const allParams = [...pathLevelParams, ...(operation.parameters ?? [])].map(
        (p) => resolveParam(p, spec),
      );

      for (const param of allParams) {
        if (!param.name || !param.in) continue;
        const location = LOCATION_MAP[param.in];
        if (!location) {
          warnings.push(`${apiKey} ${method} ${path}: parâmetro "${param.name}" com local desconhecido "${param.in}"`);
          continue;
        }

        parameters.push({
          direction: "input",
          location,
          name: param.name,
          data_type: typeLabel(param.schema) ?? typeLabel(param as Schema),
          is_required: Boolean(param.required),
          description: clean(param.description),
          example: null,
        });

        if (param.in === "body") {
          parameters.push(...expandSchema(param.schema, spec, "input", "body"));
        }
      }

      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        parameters.push({
          direction: "output",
          location: "return",
          name: status,
          data_type: typeLabel(response.schema),
          is_required: false,
          description: clean(response.description),
          example: null,
        });
        if (/^2\d\d$/.test(status)) {
          parameters.push(...expandSchema(response.schema, spec, "output", "return"));
        }
      }

      const fullPath = `${basePath}${path}`;
      entries.push({
        slug: `${apiKey}:${method}:${path}`,
        kind: "rest_new",
        name: clean(operation.operationId) ?? `${method} ${fullPath}`,
        http_method: method,
        path: fullPath,
        summary: clean(operation.summary),
        description: clean(operation.description),
        is_deprecated: Boolean(operation.deprecated),
        tags: [apiTitle, ...(operation.tags ?? [])],
        examples: [],
        parameters,
        source_url: documentUrl,
        document_url: documentUrl,
        document_title: `Fluig API (latest) - ${apiTitle}`,
      });
    }
  }

  return { entries, warnings };
}

/** Descobre as APIs publicadas pelo próprio site (assets/data/cards.json). */
export async function ingestRestNew(): Promise<ParseResult> {
  const cards = await fetchJson<{ items: Card[] }>(
    `${BASE}/assets/data/cards.json`,
  );

  const entries: NormalizedEntry[] = [];
  const warnings: string[] = [];

  for (const card of cards.items) {
    const match = card.link.match(/^\.\/([a-z0-9-]+)\/swagger-ui\/?$/i);
    if (!match) {
      warnings.push(`Link inesperado em cards.json: ${card.link}`);
      continue;
    }
    const apiKey = match[1];

    if (!card.enable) {
      warnings.push(`API "${card.title}" (${apiKey}) marcada como desabilitada no site: ignorada.`);
      continue;
    }

    try {
      const text = await fetchText(`${BASE}/${apiKey}/swagger-ui/swagger.json`);
      if (!text.trim()) {
        warnings.push(`API "${card.title}" (${apiKey}): spec vazio, ignorada.`);
        continue;
      }
      const result = parseSwagger(apiKey, JSON.parse(text) as SwaggerSpec);
      entries.push(...result.entries);
      warnings.push(...result.warnings);
      console.log(`  ${apiKey}: ${result.entries.length} operações`);
    } catch (error) {
      if (error instanceof FetchError && error.status === 404) {
        warnings.push(`API "${card.title}" (${apiKey}): spec não encontrado (404).`);
        continue;
      }
      throw error;
    }
  }

  return { entries, warnings };
}
