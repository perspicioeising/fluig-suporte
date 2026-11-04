import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EnvironmentSummary } from "./constants";

/** Lista os ambientes visíveis ao usuário (sem nenhum dado de credencial). */
export async function listEnvironments(): Promise<EnvironmentSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fluig_environments")
    .select("id, name, base_url, auth_type, has_credentials, is_active, allow_write_methods")
    .order("name", { ascending: true });
  if (error) throw new Error("Não foi possível listar os ambientes.");
  return (data ?? []) as EnvironmentSummary[];
}
