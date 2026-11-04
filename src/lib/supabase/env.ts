/**
 * Variáveis públicas do Supabase (seguras para o navegador).
 * A service role e a chave da Anthropic NUNCA devem usar o prefixo NEXT_PUBLIC.
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY não configuradas. Veja .env.example.",
    );
  }

  return { url, anonKey };
}
