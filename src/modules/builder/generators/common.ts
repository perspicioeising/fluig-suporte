/** Utilitários de escape para gerar código em várias linguagens com segurança. */

/** Literal de string JavaScript (aspas duplas, escapes JSON). */
export const jsString = (value: string) => JSON.stringify(value);

/** Literal de string Java. */
export function javaString(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

/** Argumento de shell entre aspas simples. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Substitui {param} do caminho pelos valores informados (codificados). */
export function fillPathParams(
  path: string,
  values: Record<string, string>,
): { path: string; missing: string[] } {
  const missing: string[] = [];
  const filled = path.replace(/\{([^}]+)\}/g, (_m, name: string) => {
    const value = values[name]?.trim();
    if (!value) {
      missing.push(name);
      return `PREENCHER_${name}`;
    }
    return encodeURIComponent(value);
  });
  return { path: filled, missing };
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Remove comentários de linha (//) fora de strings e tenta devolver JSON válido. */
export function tryNormalizeJson(example: string): string | null {
  let out = "";
  let inString = false;
  for (let i = 0; i < example.length; i++) {
    const ch = example[i];
    if (inString) {
      out += ch;
      if (ch === "\\") out += example[++i] ?? "";
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && example[i + 1] === "/") {
      while (i < example.length && example[i] !== "\n") i++;
      out += "\n";
    } else {
      out += ch;
    }
  }

  const cleaned = out.replace(/\t/g, "  ").trim();
  const attempts = [
    cleaned,
    // vírgulas ausentes entre membros/itens (comum nos exemplos da documentação)
    cleaned.replace(/([}\]"\d]|true|false|null)(\s*\n\s*)(?=["{[])/g, "$1,$2"),
    // vírgula sobrando antes de } ou ]
    cleaned
      .replace(/([}\]"\d]|true|false|null)(\s*\n\s*)(?=["{[])/g, "$1,$2")
      .replace(/,(\s*[}\]])/g, "$1"),
  ];
  for (const attempt of attempts) {
    try {
      return JSON.stringify(JSON.parse(attempt), null, 2);
    } catch {
      // tenta a próxima
    }
  }
  return null;
}
