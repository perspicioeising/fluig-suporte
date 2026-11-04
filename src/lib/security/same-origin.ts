/**
 * Defesa contra CSRF nas rotas /api (segunda camada, além do Content-Type JSON e do cookie SameSite):
 * recusa requisições que o navegador marca como vindas de outro site.
 * Clientes fora do navegador não enviam esses headers, mas também não têm o cookie de sessão.
 */
export function isCrossSiteRequest(headers: Headers): boolean {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return true;

  const origin = headers.get("origin");
  if (!origin) return false;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try {
    return !host || new URL(origin).host !== host;
  } catch {
    return true;
  }
}
