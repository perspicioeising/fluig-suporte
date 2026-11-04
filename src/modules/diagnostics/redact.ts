/**
 * Oculta segredos em texto colado pelo usuário (logs, headers, corpos) ANTES de
 * enviar ao modelo ou gravar no banco. Código puro: roda no servidor e nos testes.
 */

// Chaves sensíveis em pares chave=valor, JSON e XML.
const SENSITIVE_KEY =
  "(?:password|passwd|pwd|senha|secret|client_secret|consumer_secret|token_secret|tokensecret|access_token|accesstoken|refresh_token|token|api[_-]?key|apikey|oauth_signature|oauth_token|oauth_consumer_key|oauth_nonce)";

type Rule = { pattern: RegExp; replace: (...groups: string[]) => string };

const RULES: Rule[] = [
  // Authorization: OAuth ... (o valor tem aspas e vírgulas: ocultar a linha toda)
  {
    pattern: /(authorization\s*[:=]\s*["']?)(oauth)(\s+)[^\r\n]+/gi,
    replace: (_m, pre, scheme, space) => `${pre}${scheme}${space}***`,
  },
  // Authorization: Basic/Bearer/Digest <credencial>
  {
    pattern: /(authorization\s*[:=]\s*["']?)(basic|bearer|digest)(\s+)[^\s"',;]+/gi,
    replace: (_m, pre, scheme, space) => `${pre}${scheme}${space}***`,
  },
  // JSON: "authorization": "...", "password": "..."
  {
    pattern: new RegExp(`("(?:authorization|${SENSITIVE_KEY})"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, "gi"),
    replace: (_m, pre) => `${pre}"***"`,
  },
  // Cookies e set-cookie
  {
    pattern: /((?:set-)?cookie\s*:\s*)(?!\*\*\*)[^\r\n]+/gi,
    replace: (_m, pre) => `${pre}***`,
  },
  // XML: <password>valor</password>, <ns:senha>...</ns:senha>
  {
    pattern: new RegExp(`(<(?:[\\w.-]+:)?[\\w.-]*${SENSITIVE_KEY}[\\w.-]*\\b[^>]*>)([^<*][^<]*)(</)`, "gi"),
    replace: (_m, open, _value, close) => `${open}***${close}`,
  },
  // key=value / key: value (query string, form, properties)
  {
    pattern: new RegExp(`\\b(${SENSITIVE_KEY})(\\s*[=:]\\s*)(?!\\*\\*\\*)(?:"[^"\\r\\n]*"|'[^'\\r\\n]*'|[^\\s&,;"'<>]+)`, "gi"),
    replace: (_m, key, sep) => `${key}${sep}***`,
  },
  // JWT
  {
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g,
    replace: () => "***",
  },
  // "Basic <base64>" solto
  {
    pattern: /\bBasic\s+(?!\*\*\*)[A-Za-z0-9+/=]{12,}/g,
    replace: () => "Basic ***",
  },
];

export function redactSecrets(input: string): { text: string; count: number } {
  let count = 0;
  let text = input;
  for (const rule of RULES) {
    text = text.replace(rule.pattern, (...args) => {
      const groups = args.slice(0, -2) as string[]; // remove offset e string completa
      const result = rule.replace(...groups);
      if (result !== groups[0]) count++;
      return result;
    });
  }
  return { text, count };
}
