/** Formato normalizado produzido por todos os parsers de documentação. */

export type ParamLocation =
  | "path"
  | "query"
  | "header"
  | "body"
  | "argument"
  | "soap_part"
  | "return";

export type NormalizedParameter = {
  direction: "input" | "output";
  location: ParamLocation;
  name: string;
  data_type: string | null;
  is_required: boolean;
  description: string | null;
  example: string | null;
};

export type NormalizedExample = {
  title: string;
  language: string;
  code: string;
};

export type NormalizedEntry = {
  slug: string;
  kind: "rest_new" | "rest_old" | "soap" | "sdk";
  name: string;
  http_method: string | null;
  path: string | null;
  summary: string | null;
  description: string | null;
  is_deprecated: boolean;
  compatibility_notes?: string | null;
  tags: string[];
  examples: NormalizedExample[];
  parameters: NormalizedParameter[];
  /** URL oficial exata onde a informação foi obtida. */
  source_url: string;
  /** URL do documento agrupador (usada na base de conhecimento). */
  document_url: string;
  document_title: string;
};

/** Página de documentação conceitual, quebrada em trechos para o RAG. */
export type ParsedDocument = {
  sourceSlug: string;
  url: string;
  title: string;
  chunks: { headingPath: string[]; content: string }[];
};

export type SourceDefinition = {
  slug: string;
  name: string;
  kind: "rest_new" | "rest_old" | "soap" | "sdk" | "docs";
  url: string;
};

export type ParseResult = {
  entries: NormalizedEntry[];
  warnings: string[];
  /** Fontes novas a criar/atualizar antes de gravar. */
  sources?: SourceDefinition[];
  documents?: ParsedDocument[];
};

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
