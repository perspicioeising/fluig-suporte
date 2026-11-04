/** Resolve o endereço do WSDL contra a URL base do ambiente (o host do WSDL pode ser interno). */
export function resolveEndpoint(envBase: string | undefined, wsdlEndpoint: string | null): string {
  if (!wsdlEndpoint) return "";
  if (!envBase) return wsdlEndpoint;
  try {
    const u = new URL(wsdlEndpoint);
    const path = `${u.pathname}${u.search}`;
    const base = new URL(envBase);
    const basePath = base.pathname.replace(/\/+$/, "");
    const prefixed = basePath !== "" && (path === basePath || path.startsWith(`${basePath}/`));
    return prefixed ? `${base.origin}${path}` : `${envBase.replace(/\/+$/, "")}${path}`;
  } catch {
    return wsdlEndpoint;
  }
}
