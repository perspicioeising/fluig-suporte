import { z } from "zod";

/**
 * Pedido de soluções oficiais para os problemas detectados no log. Entrada não confiável:
 * ids limitados em quantidade e tamanho; `.catch` descarta valores inválidos.
 */
export const SolutionsRequestSchema = z.object({
  issueIds: z
    .array(z.string().max(64))
    .max(40)
    .catch([]),
  hasSlow: z.boolean().catch(false),
  /** Pares id→query para achados de config (ids dinâmicos). */
  queries: z
    .array(
      z.object({
        id: z.string().max(80),
        query: z.string().max(200),
      }),
    )
    .max(40)
    .catch([]),
});

export type SolutionsRequest = z.infer<typeof SolutionsRequestSchema>;
