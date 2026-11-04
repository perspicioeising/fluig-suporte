import "server-only";
import * as z from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  HISTORY_PAGE_SIZE,
  historyTerms,
  periodStart,
  type HistoryDetail,
  type HistoryFilter,
  type HistoryRow,
  type HistorySearch,
} from "./schemas";

const LIST_COLUMNS = "id, user_id, environment_id, kind, method, url, status_code, duration_ms, error, created_at";
const DETAIL_COLUMNS = `${LIST_COLUMNS}, request_headers, request_body, response_headers, response_body`;

/**
 * Aplica os filtros à consulta. Compartilhado entre a listagem e a exclusão em lote,
 * para que "excluir os filtrados" remova exatamente o que a tela mostra.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyHistoryFilters<Q extends { eq: any; gte: any; or: any; ilike: any }>(
  query: Q,
  filter: HistoryFilter,
  userId: string,
): Q {
  let q = query;
  if (filter.kind) q = q.eq("kind", filter.kind);
  if (filter.env) q = q.eq("environment_id", filter.env);
  if (filter.mine) q = q.eq("user_id", userId);
  if (filter.status === "ok") q = q.gte("status_code", 200).lt("status_code", 300);
  if (filter.status === "erro") q = q.or("status_code.is.null,status_code.lt.200,status_code.gte.300");
  const since = periodStart(filter.period);
  if (since) q = q.gte("created_at", since);
  // ilike não diferencia maiúsculas/minúsculas; todos os termos precisam aparecer.
  for (const term of historyTerms(filter.q)) {
    q = q.or(`url.ilike.%${term}%,method.ilike.%${term}%,error.ilike.%${term}%`);
  }
  return q;
}

async function currentUserId(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function listHistory(search: HistorySearch) {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { rows: [] as HistoryRow[], total: 0, userId: null };

  const base = supabase
    .from("request_history")
    .select(LIST_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((search.page - 1) * HISTORY_PAGE_SIZE, search.page * HISTORY_PAGE_SIZE - 1);

  const { data, count, error } = await applyHistoryFilters(base, search, userId);
  if (error) throw new Error("Não foi possível consultar o histórico.");
  return { rows: (data ?? []) as HistoryRow[], total: count ?? 0, userId };
}

export async function getHistoryDetail(id: string): Promise<HistoryDetail | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("request_history").select(DETAIL_COLUMNS).eq("id", id).maybeSingle();
  return (data as HistoryDetail | null) ?? null;
}
