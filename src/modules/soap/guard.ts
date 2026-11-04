/**
 * Classificação conservadora de operações SOAP como "somente leitura".
 * SOAP usa sempre POST, então o método HTTP não diz se há alteração de dados:
 * só consideramos leitura o que tem nome claramente de consulta. Qualquer
 * outra operação exige que o ambiente permita métodos de escrita.
 *
 * O prefixo precisa terminar numa fronteira camelCase: "getUser" e "isActive"
 * passam; "getting", "issueToken" e "createUser" não.
 */
const READ_PREFIX =
  /^(get|find|list|search|is|has|count|read|query|retrieve|load|validate|check|exists|fetch|download|calculate)([A-Z0-9_]|$)/;

export function isReadOnlySoapName(name: string): boolean {
  // SOAPAction costuma vir entre aspas e/ou como URL ("urn:x#getFoo").
  const last = name.replace(/["']/g, "").split(/[/#:]/).pop() ?? "";
  if (!last) return false;
  const camel = last[0].toLowerCase() + last.slice(1);
  return READ_PREFIX.test(camel);
}
