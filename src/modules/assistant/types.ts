import * as z from "zod";

/** Fonte (trecho da documentação oficial) usada para fundamentar uma resposta. */
export type Source = {
  /** Número usado nas citações [n] do texto. */
  index: number;
  title: string;
  /** URL oficial de origem. */
  url: string;
  /** rest_new | rest_old | soap | sdk | docs */
  kind: string;
  /** Entrada do catálogo (para link interno), quando houver. */
  entryId: string | null;
  snippet: string;
  /** Preenchido ao final: o texto da resposta citou esta fonte. */
  cited?: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Source[];
  created_at: string;
};

export type ConversationSummary = {
  id: string;
  title: string | null;
  updated_at: string;
};

/** Eventos enviados pelo servidor (uma linha JSON por evento – NDJSON). */
export type StreamEvent =
  | { type: "meta"; conversationId: string; sources: Source[] }
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string | null; sources: Source[] }
  | { type: "error"; message: string };

export const ChatRequestSchema = z.object({
  conversationId: z.uuid().optional(),
  message: z
    .string()
    .trim()
    .min(1, { error: "Digite uma pergunta." })
    .max(4000, { error: "A pergunta pode ter no máximo 4000 caracteres." }),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
