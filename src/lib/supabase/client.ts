import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

/** Cliente Supabase para Client Components. */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
