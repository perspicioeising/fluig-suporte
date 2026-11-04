import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com service role: IGNORA o RLS. Usar apenas no servidor e somente
 * depois de verificar a autorização do usuário com o cliente normal.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
