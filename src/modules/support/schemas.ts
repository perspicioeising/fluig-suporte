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
});

export type SolutionsRequest = z.infer<typeof SolutionsRequestSchema>;
