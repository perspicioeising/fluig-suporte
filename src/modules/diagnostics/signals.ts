/**
 * Detecção determinística de sinais em um erro colado pelo usuário.
 * Não conclui causa nenhuma: apenas extrai fatos observáveis e palavras-chave
 * para melhorar a busca na documentação.
 */

export type SignalId =
  | "http_400" | "http_401" | "http_403" | "http_404" | "http_405" | "http_408" | "http_413" | "http_415"
  | "http_422" | "http_429" | "http_500" | "http_502" | "http_503" | "http_504"
  | "timeout" | "tls" | "dns" | "refused"
  | "soap_fault" | "login_failed" | "json_error" | "xml_error"
  | "oauth" | "tenant" | "not_allowed" | "sdk_exception";

export type Signal = {
  id: SignalId;
  label: string;
  /** Trecho do texto que motivou o sinal (curto). */
  evidence: string;
};

export type Category =
  | "auto" | "auth" | "timeout" | "soap" | "payload" | "rest" | "sdk" | "network";

export const CATEGORY_LABELS: Record<Category, string> = {
  auto: "Detectar automaticamente",
  auth: "Autenticação / autorização (401, 403)",
  timeout: "Timeout / lentidão",
  soap: "Web Service SOAP",
  payload: "JSON ou XML inválido",
  rest: "API REST",
  sdk: "SDK / eventos",
  network: "Rede / TLS / DNS",
};

const STATUS_LABEL: Record<number, string> = {
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed",
  408: "Request Timeout", 413: "Payload Too Large", 415: "Unsupported Media Type", 422: "Unprocessable Entity",
  429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
  504: "Gateway Timeout",
};

type TextRule = { id: SignalId; label: string; pattern: RegExp };

const TEXT_RULES: TextRule[] = [
  { id: "timeout", label: "Tempo limite excedido", pattern: /timed?\s*out|ETIMEDOUT|tempo\s+limite|read\s+timeout|connect\s+timeout|SocketTimeout/i },
  { id: "tls", label: "Falha de certificado/TLS", pattern: /certificate|certificado|SSLHandshake|SELF_SIGNED|PKIX|UNABLE_TO_VERIFY|CERT_HAS_EXPIRED|ERR_TLS/i },
  { id: "dns", label: "Falha de DNS", pattern: /ENOTFOUND|EAI_AGAIN|getaddrinfo|UnknownHost|nome\s+de\s+host|host\s+n[ãa]o\s+encontrado/i },
  { id: "refused", label: "Conexão recusada", pattern: /ECONNREFUSED|connection\s+refused|conex[ãa]o\s+recusada|ECONNRESET/i },
  { id: "soap_fault", label: "SOAP Fault", pattern: /<(?:[\w.-]+:)?Fault\b|faultcode|faultstring|SOAPFault/i },
  { id: "login_failed", label: "Falha de login informada pelo serviço", pattern: /falha\s+de\s+login|login\s+failed|invalid\s+credentials|credenciais\s+inv[áa]lidas|UT01/i },
  { id: "json_error", label: "Erro de JSON", pattern: /Unexpected\s+(?:token|end\s+of\s+JSON)|JsonParseException|JSON\s+parse|MalformedJson|JsonMappingException|is\s+not\s+valid\s+JSON/i },
  { id: "xml_error", label: "Erro de XML", pattern: /SAXParseException|not\s+well-formed|Premature\s+end\s+of\s+file|XML\s+(?:inv[áa]lido|malformed|parse)|XMLStreamException|mal\s+formado/i },
  { id: "oauth", label: "Indício relacionado a OAuth", pattern: /oauth|signature_invalid|token_rejected|consumer_key|oauth_problem/i },
  { id: "tenant", label: "Tenant não selecionado", pattern: /tenantNotSelected/i },
  { id: "not_allowed", label: "Operação não permitida (NotAllowed/Forbidden)", pattern: /NotAllowedException|ForbiddenException|Access\s+denied|acesso\s+negado|sem\s+permiss[ãa]o/i },
  { id: "sdk_exception", label: "Exceção do SDK/Java", pattern: /SDKException|NullPointerException|ClassNotFoundException|NoSuchMethod|NoClassDefFound/i },
];

const KNOWN_STATUS = Object.keys(STATUS_LABEL).map(Number);

/** HTTP 4xx/5xx citados com contexto (HTTP, status, code, ou frase do motivo). */
function detectStatuses(text: string): number[] {
  const found = new Set<number>();
  for (const code of KNOWN_STATUS) {
    const reason = STATUS_LABEL[code].replace(/\s+/g, "\\s+");
    const pattern = new RegExp(
      `(?:HTTP[/\\s\\d.]*|status(?:\\s*code)?\\s*[:=]?\\s*|c[óo]digo\\s*[:=]?\\s*|\\bcode\\s*[:=]?\\s*|\\b)${code}\\b(?=[\\s\\S]{0,12}${reason})|(?:HTTP[/\\s\\d.]*|status(?:\\s*code)?\\s*[:=]?\\s*|c[óo]digo\\s*[:=]?\\s*|"code"\\s*:\\s*)${code}\\b`,
      "i",
    );
    if (pattern.test(text)) found.add(code);
  }
  return [...found].sort((a, b) => a - b);
}

function snippet(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match) return "";
  const start = Math.max(0, match.index - 30);
  return text.slice(start, match.index + match[0].length + 60).replace(/\s+/g, " ").trim().slice(0, 140);
}

export function detectSignals(text: string): Signal[] {
  const signals: Signal[] = [];

  for (const code of detectStatuses(text)) {
    signals.push({
      id: `http_${code}` as SignalId,
      label: `HTTP ${code} ${STATUS_LABEL[code]}`,
      evidence: snippet(text, new RegExp(`\\b${code}\\b`)),
    });
  }
  // 408/504 também são timeout
  for (const rule of TEXT_RULES) {
    if (rule.pattern.test(text)) {
      signals.push({ id: rule.id, label: rule.label, evidence: snippet(text, rule.pattern) });
    }
  }
  if (signals.some((s) => s.id === "http_504" || s.id === "http_408") && !signals.some((s) => s.id === "timeout")) {
    signals.push({ id: "timeout", label: "Tempo limite excedido", evidence: "HTTP 408/504" });
  }
  return signals;
}

/** Palavras-chave para a busca na documentação, por sinal. */
const QUERY_HINTS: Partial<Record<SignalId, string>> = {
  http_401: "autenticação OAuth credenciais não autorizado",
  http_403: "permissão acesso negado usuário aplicativo OAuth",
  http_404: "endpoint caminho API pública",
  http_415: "formato JSON Content-Type",
  http_500: "erro interno serviço",
  timeout: "timeout tempo limite",
  tls: "certificado HTTPS SSL",
  soap_fault: "Web Services SOAP Fault erro segurança permissão",
  login_failed: "Web Services SOAP usuário senha parâmetros permissão",
  json_error: "JSON formato corpo requisição",
  xml_error: "XML SOAP envelope formato",
  oauth: "OAuth 1.0a consumer key token secret autenticação",
  tenant: "OAuth aplicativo cadastrar autenticação",
  not_allowed: "permissão serviço método Web Services",
  sdk_exception: "SDK fluigAPI serviço eventos",
};

const CATEGORY_HINTS: Record<Category, string> = {
  auto: "",
  auth: "autenticação OAuth permissão",
  timeout: "timeout",
  soap: "Web Services SOAP",
  payload: "JSON XML formato",
  rest: "API REST pública",
  sdk: "SDK fluigAPI",
  network: "HTTPS certificado",
};

export function buildSearchQuery(text: string, signals: Signal[], category: Category): string {
  const hints = new Set<string>();
  if (CATEGORY_HINTS[category]) hints.add(CATEGORY_HINTS[category]);
  for (const s of signals) {
    const hint = QUERY_HINTS[s.id];
    if (hint) hints.add(hint);
  }
  // Identificadores (getFoo, ECMFooService, Service.metodo) valem mais que prosa.
  const identifiers = text.match(/\b(?:[a-z]+(?:[A-Z][a-z0-9]*)+|[A-Z][A-Za-z0-9]*(?:Service|Dto)|[A-Za-z]+\.[a-z][A-Za-z0-9]+)\b/g) ?? [];
  return [...hints, ...new Set(identifiers)].join(" ").slice(0, 600);
}

/** Categoria sugerida a partir dos sinais, quando o usuário escolhe "detectar". */
export function inferCategory(signals: Signal[]): Category {
  const ids = new Set(signals.map((s) => s.id));
  if (ids.has("soap_fault") || ids.has("login_failed")) return "soap";
  if (ids.has("json_error") || ids.has("xml_error")) return "payload";
  if (ids.has("sdk_exception")) return "sdk";
  if (ids.has("timeout")) return "timeout";
  if (ids.has("tls") || ids.has("dns") || ids.has("refused")) return "network";
  if (ids.has("http_401") || ids.has("http_403") || ids.has("oauth") || ids.has("tenant") || ids.has("not_allowed")) return "auth";
  if ([...ids].some((i) => i.startsWith("http_"))) return "rest";
  return "auto";
}
