/** Formato normalizado produzido por todos os parsers de documentação. */

export type ParamLocation =
  | "path"
  | "query"
  | "header"
  | "body"
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
  tags: string[];
  examples: NormalizedExample[];
  parameters: NormalizedParameter[];
  /** URL oficial exata onde a informação foi obtida. */
  source_url: string;
  /** URL do documento agrupador (usada na base de conhecimento). */
  document_url: string;
  document_title: string;
};

export type ParseResult = {
  entries: NormalizedEntry[];
  warnings: string[];
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
