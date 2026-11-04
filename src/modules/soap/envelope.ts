import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
import type { MessageShape, ParamNode, SoapOperation } from "./types";

/**
 * Geração e inspeção de envelopes SOAP. Código puro (roda no navegador e no servidor).
 *
 * Credenciais: parâmetros chamados user/username/login e password/senha recebem os
 * marcadores {{ENV_USERNAME}} e {{ENV_PASSWORD}}. O SERVIDOR os substitui pelas
 * credenciais (Basic) cadastradas no ambiente, que nunca chegam ao navegador.
 */

export const ENV_USERNAME = "{{ENV_USERNAME}}";
export const ENV_PASSWORD = "{{ENV_PASSWORD}}";

const USERNAME_NAMES = /^(user|username|login|usuario)$/i;
const PASSWORD_NAMES = /^(password|senha)$/i;

const SOAP_NS = {
  "1.1": "http://schemas.xmlsoap.org/soap/envelope/",
  "1.2": "http://www.w3.org/2003/05/soap-envelope",
} as const;

/* ------------------------------ Geração ---------------------------------- */

function sampleScalar(type: string, name: string): string {
  if (USERNAME_NAMES.test(name) && /string/i.test(type)) return ENV_USERNAME;
  if (PASSWORD_NAMES.test(name) && /string/i.test(type)) return ENV_PASSWORD;

  switch (type.split(":").pop()) {
    case "int":
    case "long":
    case "short":
    case "integer":
      return "0";
    case "double":
    case "float":
    case "decimal":
      return "0.0";
    case "boolean":
      return "false";
    case "dateTime":
      return "2024-01-01T00:00:00";
    case "date":
      return "2024-01-01";
    default:
      return "string";
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

class Prefixes {
  private map = new Map<string, string>();
  get(ns: string): string {
    let prefix = this.map.get(ns);
    if (!prefix) {
      prefix = this.map.size === 0 ? "tns" : `ns${this.map.size + 1}`;
      this.map.set(ns, prefix);
    }
    return prefix;
  }
  declarations() {
    return [...this.map].map(([ns, prefix]) => `xmlns:${prefix}="${ns}"`).join(" ");
  }
}

function comments(param: ParamNode, indent: string): string[] {
  const out: string[] = [];
  const repeatable = param.maxOccurs === null || param.maxOccurs > 1;
  if (param.minOccurs === 0 && repeatable) out.push(`${indent}<!--Opcional; pode se repetir-->`);
  else if (param.minOccurs === 0) out.push(`${indent}<!--Opcional-->`);
  else if (repeatable) out.push(`${indent}<!--Pode se repetir-->`);
  if (param.enum?.length) out.push(`${indent}<!--Valores permitidos: ${param.enum.join(" | ")}-->`);
  return out;
}

function renderParam(param: ParamNode, prefixes: Prefixes, depth: number, stack: string[]): string {
  const indent = "  ".repeat(depth);
  const tag = param.qualified && param.ns ? `${prefixes.get(param.ns)}:${param.name}` : param.name;
  const lines = comments(param, indent);

  if (param.children?.length) {
    if (param.recursive || stack.includes(param.type)) {
      lines.push(`${indent}<${tag}/><!--Tipo recursivo (${param.type}) omitido no exemplo-->`);
    } else {
      lines.push(`${indent}<${tag}>`);
      for (const child of param.children) {
        lines.push(renderParam(child, prefixes, depth + 1, [...stack, param.type]));
      }
      lines.push(`${indent}</${tag}>`);
    }
  } else if (param.enum?.length) {
    lines.push(`${indent}<${tag}>${esc(param.enum[0])}</${tag}>`);
  } else {
    lines.push(`${indent}<${tag}>${esc(sampleScalar(param.type, param.name))}</${tag}>`);
  }
  return lines.join("\n");
}

function renderBody(shape: MessageShape, prefixes: Prefixes): string {
  if (!shape.wrapper) {
    return shape.params.map((p) => renderParam(p, prefixes, 2, [])).join("\n");
  }
  const tag = `${prefixes.get(shape.wrapper.ns)}:${shape.wrapper.name}`;
  if (shape.params.length === 0) return `    <${tag}/>`;
  const inner = shape.params.map((p) => renderParam(p, prefixes, 3, [])).join("\n");
  return `    <${tag}>\n${inner}\n    </${tag}>`;
}

/** Monta o envelope de requisição de uma operação, com valores de exemplo. */
export function buildSoapEnvelope(op: SoapOperation): string {
  const prefixes = new Prefixes();
  const body = renderBody(op.input, prefixes); // registra os namespaces usados
  const declarations = prefixes.declarations();

  return [
    `<soapenv:Envelope xmlns:soapenv="${SOAP_NS[op.soapVersion]}"${declarations ? ` ${declarations}` : ""}>`,
    `  <soapenv:Header/>`,
    `  <soapenv:Body>`,
    body,
    `  </soapenv:Body>`,
    `</soapenv:Envelope>`,
  ].join("\n");
}

/* ----------------------- Exemplos de consumo (cURL/JS/Java) --------------- */

export type SampleInput = {
  endpoint: string;
  soapAction: string;
  soapVersion: "1.1" | "1.2";
  envelope: string;
};

function forSamples(envelope: string) {
  return envelope.replaceAll(ENV_USERNAME, "SEU_USUARIO").replaceAll(ENV_PASSWORD, "SUA_SENHA");
}

function contentType({ soapVersion, soapAction }: SampleInput) {
  return soapVersion === "1.2"
    ? `application/soap+xml; charset=utf-8; action="${soapAction}"`
    : "text/xml; charset=utf-8";
}

export function buildCurlSample(input: SampleInput): string {
  const lines = [`curl -X POST '${input.endpoint}' \\`, `  -H 'Content-Type: ${contentType(input)}' \\`];
  if (input.soapVersion === "1.1") lines.push(`  -H 'SOAPAction: "${input.soapAction}"' \\`);
  lines.push(`  --data-binary @- <<'EOF'`, forSamples(input.envelope), `EOF`);
  return lines.join("\n");
}

export function buildJavaScriptSample(input: SampleInput): string {
  const headers = [`"Content-Type": ${JSON.stringify(contentType(input))}`];
  if (input.soapVersion === "1.1") headers.push(`"SOAPAction": ${JSON.stringify(`"${input.soapAction}"`)}`);
  const xml = forSamples(input.envelope).replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  return [
    `const envelope = \`${xml}\`;`,
    ``,
    `const response = await fetch(${JSON.stringify(input.endpoint)}, {`,
    `  method: "POST",`,
    `  headers: { ${headers.join(", ")} },`,
    `  body: envelope,`,
    `});`,
    `console.log(response.status, await response.text());`,
  ].join("\n");
}

export function buildJavaSample(input: SampleInput): string {
  const xml = forSamples(input.envelope).replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"');
  return [
    `// Java 15+ (text block). Usa apenas a biblioteca padrão (java.net.http).`,
    `String envelope = """`,
    xml,
    `""";`,
    ``,
    `HttpRequest request = HttpRequest.newBuilder()`,
    `    .uri(URI.create(${JSON.stringify(input.endpoint)}))`,
    `    .header("Content-Type", ${JSON.stringify(contentType(input))})`,
    ...(input.soapVersion === "1.1" ? [`    .header("SOAPAction", ${JSON.stringify(`"${input.soapAction}"`)})`] : []),
    `    .POST(HttpRequest.BodyPublishers.ofString(envelope))`,
    `    .build();`,
    ``,
    `HttpResponse<String> response = HttpClient.newHttpClient()`,
    `    .send(request, HttpResponse.BodyHandlers.ofString());`,
    `System.out.println(response.statusCode() + " " + response.body());`,
  ].join("\n");
}

/* ------------------------- Inspeção / segurança -------------------------- */

const SENSITIVE_ELEMENT =
  /(<(?:[\w.-]+:)?[\w.-]*(?:pass|senha|secret|token)[\w.-]*\b[^>]*>)([\s\S]*?)(<\/)/gi;

/** Oculta valores de elementos sensíveis (senha, token...) antes de gravar no histórico. */
export function maskSensitiveXml(xml: string): string {
  return xml.replace(SENSITIVE_ELEMENT, (_m, open: string, value: string, close: string) =>
    value.trim() === "" || value.includes("{{ENV_") ? `${open}${value}${close}` : `${open}***${close}`,
  );
}

/** Substitui os marcadores pelas credenciais do ambiente (valores escapados para XML). */
export function applyEnvPlaceholders(xml: string, creds: { username?: string; password?: string }) {
  return xml
    .replaceAll(ENV_USERNAME, esc(creds.username ?? ""))
    .replaceAll(ENV_PASSWORD, esc(creds.password ?? ""));
}

export function hasEnvPlaceholders(xml: string) {
  return xml.includes(ENV_USERNAME) || xml.includes(ENV_PASSWORD);
}

const plainParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  textNodeName: "#text",
});

const local = (key: string) => key.slice(key.indexOf(":") + 1);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function findChild(node: unknown, name: string): unknown {
  if (!isObj(node)) return undefined;
  for (const [k, v] of Object.entries(node)) {
    if (!k.startsWith("@_") && local(k) === name) return v;
  }
  return undefined;
}

export type EnvelopeInfo =
  | { ok: true; bodyElement: string; soapVersion: "1.1" | "1.2" }
  | { ok: false; error: string };

/** Valida que é XML bem formado com Envelope/Body e devolve o nome do elemento do Body. */
export function inspectEnvelope(xml: string): EnvelopeInfo {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    return { ok: false, error: `XML inválido: ${validation.err.msg} (linha ${validation.err.line}).` };
  }
  const doc = plainParser.parse(xml) as Record<string, unknown>;
  const envKey = Object.keys(doc).find((k) => !k.startsWith("?") && local(k) === "Envelope");
  if (!envKey) return { ok: false, error: "O XML precisa ter um elemento Envelope SOAP." };

  const envelope = doc[envKey];
  const nsDecl = isObj(envelope)
    ? Object.entries(envelope).find(
        ([k, v]) => k.startsWith("@_xmlns") && (v === SOAP_NS["1.1"] || v === SOAP_NS["1.2"]),
      )
    : undefined;
  const soapVersion = nsDecl?.[1] === SOAP_NS["1.2"] ? "1.2" : "1.1";

  const body = findChild(envelope, "Body");
  if (!isObj(body)) return { ok: false, error: "O Envelope precisa ter um elemento Body com conteúdo." };

  const first = Object.keys(body).find((k) => !k.startsWith("@_") && k !== "#text");
  if (!first) return { ok: false, error: "O Body está vazio." };

  return { ok: true, bodyElement: local(first), soapVersion };
}

export type SoapFault = { code: string; message: string; detail?: string };

const textOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (isObj(v)) {
    const direct = v["#text"];
    if (typeof direct === "string") return direct;
    return Object.entries(v)
      .filter(([k]) => !k.startsWith("@_"))
      .map(([, child]) => textOf(child))
      .join(" ")
      .trim();
  }
  return "";
};

/** Extrai o SOAP Fault (1.1 ou 1.2) de uma resposta, se houver. */
export function parseSoapFault(xml: string): SoapFault | null {
  if (!xml.includes("Fault")) return null;
  try {
    const doc = plainParser.parse(xml) as Record<string, unknown>;
    const envKey = Object.keys(doc).find((k) => !k.startsWith("?") && local(k) === "Envelope");
    const body = envKey ? findChild(doc[envKey], "Body") : undefined;
    const fault = findChild(body, "Fault");
    if (!isObj(fault)) return null;

    const code = textOf(findChild(fault, "faultcode")) || textOf(findChild(findChild(fault, "Code"), "Value"));
    const message =
      textOf(findChild(fault, "faultstring")) || textOf(findChild(findChild(fault, "Reason"), "Text"));
    const detail = textOf(findChild(fault, "detail")) || textOf(findChild(fault, "Detail"));
    return { code, message, detail: detail || undefined };
  } catch {
    return null;
  }
}

/** Formata XML com indentação preservando ordem e comentários; em erro devolve o original. */
export function prettyXml(xml: string): string {
  try {
    const options = {
      preserveOrder: true,
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      commentPropName: "#comment",
      parseTagValue: false,
      trimValues: true,
    } as const;
    const tree = new XMLParser(options).parse(xml);
    return new XMLBuilder({ ...options, format: true, indentBy: "  " }).build(tree).trim();
  } catch {
    return xml;
  }
}
