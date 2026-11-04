export type ParsedSignature = {
  /** Tudo antes do nome do método (tipo de retorno e modificadores). */
  prefix: string;
  name: string;
  params: { type: string; name: string }[];
};

/** Normaliza espaços, inclusive NBSP e quebras de linha. */
export const squash = (value: string | undefined | null) =>
  (value ?? "")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "") // invisíveis (ex.: Javadoc insere U+200B)
    .replace(/[\s\u00a0]+/g, " ")
    .trim();

/** Divide por vírgulas ignorando as que estão dentro de <...> (genéricos). */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "<") depth++;
    if (ch === ">") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Interpreta "RetornoTipo nome(Tipo a, Tipo<B, C> b) throws X".
 * Retorna null se não houver parênteses.
 */
export function parseSignature(raw: string): ParsedSignature | null {
  const text = squash(raw).replace(/\s+throws\s+.*$/i, "");
  const open = text.indexOf("(");
  if (open < 0) return null;

  let depth = 0;
  let close = -1;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) return null;

  const head = text.slice(0, open).trim();
  const nameMatch = head.match(/([A-Za-z_][\w$]*)$/);
  if (!nameMatch) return null;

  const params = splitTopLevel(text.slice(open + 1, close))
    .map((p) => p.replace(/\bfinal\b/g, "").trim())
    .filter(Boolean)
    .map((p) => {
      const tokens = p.match(/^(.*\S)\s+([A-Za-z_][\w$]*)$/);
      return tokens
        ? { type: tokens[1].trim(), name: tokens[2] }
        : { type: "", name: p };
    });

  return {
    prefix: head.slice(0, head.length - nameMatch[1].length).trim(),
    name: nameMatch[1],
    params,
  };
}

/** "UserVO create(UserVO vo)" sem "throws ..." e com espaços normalizados. */
export function cleanSignature(raw: string) {
  return squash(raw).replace(/\s+throws\s+.*$/i, "").replace(/\s+\(/, "(");
}
