import "server-only";
import * as z from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Source } from "@/modules/assistant/types";
import type { Signal } from "./signals";
import type { DiagnosticRecord, DiagnosticSummary, HistoryOption } from "./types";

const HISTORY_COLUMNS = "id, kind, method, url, status_code, duration_ms, error, created_at";

export async function listDiagnostics(): Promise<DiagnosticSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("diagnostics")
    .select("id, category, created_at, input_text")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error("Não foi possível listar os diagnósticos.");
  return (data ?? []).map((d) => ({
    id: d.id as string,
    category: d.category as string | null,
    created_at: d.created_at as string,
    preview: String(d.input_text).replace(/\s+/g, " ").slice(0, 90),
  }));
}

export async function getDiagnostic(id: string): Promise<DiagnosticRecord | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("diagnostics")
    .select("id, category, created_at, input_text, result, sources")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const result = (data.result ?? {}) as { markdown?: string; signals?: Signal[]; redactions?: number };
  return {
    id: data.id as string,
    category: data.category as string | null,
    created_at: data.created_at as string,
    input_text: data.input_text as string,
    markdown: result.markdown ?? "",
    signals: result.signals ?? [],
    sources: (data.sources ?? []) as Source[],
    redactions: result.redactions ?? 0,
  };
}

/** Últimas requisições (REST e SOAP) para anexar ao diagnóstico; `include` garante um item específico. */
export async function listHistoryOptions(include?: string | null): Promise<HistoryOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("request_history")
    .select(HISTORY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(20);
  const list = (data ?? []) as HistoryOption[];

  if (include && z.uuid().safeParse(include).success && !list.some((h) => h.id === include)) {
    const { data: extra } = await supabase.from("request_history").select(HISTORY_COLUMNS).eq("id", include).maybeSingle();
    if (extra) list.unshift(extra as HistoryOption);
  }
  return list;
}
