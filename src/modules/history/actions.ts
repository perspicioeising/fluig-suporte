"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { applyHistoryFilters } from "./queries";
import { HistoryFilterSchema, type HistoryFilter } from "./schemas";

export type HistoryActionResult = { ok: boolean; message: string };

function refresh() {
  revalidatePath("/historico");
  revalidatePath("/tester");
  revalidatePath("/dashboard");
}

/** Exclui um registro. A RLS só permite apagar registros do próprio usuário; o filtro reforça isso. */
export async function deleteHistoryItem(id: string): Promise<HistoryActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Registro inválido." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sessão expirada. Entre novamente." };

  const { data, error } = await supabase
    .from("request_history")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return { ok: false, message: "Não foi possível excluir o registro." };
  if (!data?.length) return { ok: false, message: "Só é possível excluir registros feitos por você." };

  refresh();
  return { ok: true, message: "Registro excluído." };
}

/**
 * Exclui os registros DO USUÁRIO que correspondem aos filtros atuais.
 * Registros de outros membros do workspace nunca são afetados.
 */
export async function deleteFilteredHistory(filter: HistoryFilter): Promise<HistoryActionResult> {
  const parsed = HistoryFilterSchema.safeParse(filter);
  if (!parsed.success) return { ok: false, message: "Filtros inválidos." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sessão expirada. Entre novamente." };

  const query = supabase.from("request_history").delete().eq("user_id", user.id);
  const { data, error } = await applyHistoryFilters(query, parsed.data, user.id).select("id");
  if (error) return { ok: false, message: "Não foi possível excluir os registros." };

  refresh();
  const n = data?.length ?? 0;
  return {
    ok: true,
    message: n === 0 ? "Nenhum registro seu corresponde aos filtros." : `${n} ${n === 1 ? "registro excluído" : "registros excluídos"}.`,
  };
}
