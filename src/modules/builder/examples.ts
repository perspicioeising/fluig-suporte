import * as z from "zod";
import type { CatalogExample } from "@/modules/catalog/types";

/** Versão sem 'server-only' de parseExamples: examples é jsonb livre, valida antes de usar. */
export function parseExamplesClient(raw: unknown): CatalogExample[] {
  const parsed = z
    .array(
      z.object({
        title: z.string().optional(),
        language: z.string().optional(),
        code: z.string(),
      }),
    )
    .safeParse(raw);
  return parsed.success ? parsed.data : [];
}
