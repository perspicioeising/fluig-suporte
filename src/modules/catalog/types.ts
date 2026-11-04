import * as z from "zod";

export const ENTRY_KINDS = ["rest_new", "rest_old", "soap", "sdk"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const KIND_LABELS: Record<EntryKind, string> = {
  rest_new: "REST (novo)",
  rest_old: "REST (antigo)",
  soap: "SOAP",
  sdk: "SDK",
};

export type CatalogEntry = {
  id: string;
  slug: string;
  kind: EntryKind;
  name: string;
  http_method: string | null;
  path: string | null;
  summary: string | null;
  description: string | null;
  min_version: string | null;
  max_version: string | null;
  is_deprecated: boolean;
  compatibility_notes: string | null;
  examples: unknown;
  tags: string[];
  source_url: string;
};

export type CatalogParameter = {
  id: string;
  direction: "input" | "output";
  location: string;
  name: string;
  data_type: string | null;
  is_required: boolean;
  description: string | null;
  example: string | null;
  position: number;
};

export type CatalogExample = {
  title?: string;
  language?: string;
  code: string;
};

/** Valida os parâmetros de busca vindos da URL (entrada não confiável). */
export const CatalogSearchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  kind: z.enum(ENTRY_KINDS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type CatalogSearch = z.infer<typeof CatalogSearchSchema>;

export const PAGE_SIZE = 20;
