import * as z from "zod";
import type { Source } from "@/modules/assistant/types";
import type { Category, Signal } from "./signals";

export const CATEGORIES = ["auto", "auth", "timeout", "soap", "payload", "rest", "sdk", "network"] as const;

export const DiagnoseRequestSchema = z.object({
  errorText: z
    .string()
    .trim()
    .min(10, { error: "Descreva ou cole o erro (mínimo de 10 caracteres)." })
    .max(20_000, { error: "O texto pode ter no máximo 20.000 caracteres." }),
  category: z.enum(CATEGORIES).default("auto"),
  environmentId: z.uuid().optional(),
  historyId: z.uuid().optional(),
});
export type DiagnoseRequest = z.infer<typeof DiagnoseRequestSchema>;

export type DiagnosticEvent =
  | {
      type: "meta";
      category: Category;
      signals: Signal[];
      sources: Source[];
      /** Quantos valores sensíveis foram ocultados antes da análise. */
      redactions: number;
      /** Evidências adicionais anexadas (ambiente, requisição do histórico). */
      attached: string[];
    }
  | { type: "delta"; text: string }
  | { type: "done"; diagnosticId: string | null; sources: Source[] }
  | { type: "error"; message: string };

export type DiagnosticSummary = {
  id: string;
  category: string | null;
  created_at: string;
  preview: string;
};

export type DiagnosticRecord = {
  id: string;
  category: string | null;
  created_at: string;
  input_text: string;
  markdown: string;
  signals: Signal[];
  sources: Source[];
  redactions: number;
};

export type HistoryOption = {
  id: string;
  kind: "rest" | "soap";
  method: string;
  url: string;
  status_code: number | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
};
