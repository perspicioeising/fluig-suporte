import type { Snippet } from "../types";
import { javaString, joinUrl, jsString, shellQuote } from "./common";

export type RestInput = {
  method: string;
  /** https://host (sem barra final). */
  baseUrl: string;
  /** Caminho completo, já com /api/public (REST antigo) e parâmetros de caminho preenchidos. */
  path: string;
  query: { key: string; value: string }[];
  /** Headers documentados (as credenciais do ambiente NÃO entram aqui). */
  headers?: { key: string; value: string }[];
  /** Corpo (texto). Enviado apenas em métodos com corpo. */
  body?: string;
};

const NO_BODY = ["GET", "HEAD", "OPTIONS"];

function bodyOf(input: RestInput): string | null {
  const body = input.body?.trim();
  return body && !NO_BODY.includes(input.method.toUpperCase()) ? body : null;
}

function asJson(body: string): string | null {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return null;
  }
}

const OAUTH_NOTE =
  "A API pública do Fluig usa OAuth 1.0a (HMAC-SHA1). Use a consumer key/secret do aplicativo cadastrado em Painel de controle > Oauth Application e o access token/secret do usuário aplicativo.";

/* --------------------------------- cURL ----------------------------------- */

function curl(input: RestInput): Snippet {
  const url = new URL(joinUrl(input.baseUrl, input.path));
  for (const q of input.query) if (q.key) url.searchParams.append(q.key, q.value);
  const body = bodyOf(input);

  const parts = [
    `curl -X ${input.method.toUpperCase()} ${shellQuote(url.toString())}`,
    "-H 'Accept: application/json'",
    ...(body ? ["-H 'Content-Type: application/json'"] : []),
    ...(input.headers ?? [])
      .filter((h) => h.key)
      .map((h) => `-H ${shellQuote(`${h.key}: ${h.value}`)}`),
    `-H ${shellQuote(
      'Authorization: OAuth oauth_consumer_key="CONSUMER_KEY", oauth_token="ACCESS_TOKEN", oauth_signature_method="HMAC-SHA1", oauth_timestamp="TIMESTAMP", oauth_nonce="NONCE", oauth_version="1.0", oauth_signature="ASSINATURA"',
    )}`,
    ...(body ? [`--data-binary ${shellQuote(body)}`] : []),
  ];

  return {
    id: "curl",
    label: "cURL",
    language: "bash",
    code: parts.join(" \\\n  "),
    notes: [
      OAUTH_NOTE,
      "O cURL não assina OAuth 1.0a sozinho: a oauth_signature depende de timestamp e nonce de cada chamada. Gere o cabeçalho com os exemplos em JavaScript ou Java, ou use o API Tester do Studio.",
    ],
  };
}

/* ------------------------------- JavaScript ------------------------------- */

function javascript(input: RestInput): Snippet {
  const body = bodyOf(input);
  const json = body ? asJson(body) : null;
  const method = input.method.toUpperCase();

  const lines = [
    "// Node.js 18+ (fetch e crypto nativos). Salve como .mjs ou use \"type\": \"module\".",
    "import crypto from \"node:crypto\";",
    "",
    `const BASE_URL = ${jsString(input.baseUrl)};`,
    "const CONSUMER_KEY = \"SUA_CONSUMER_KEY\";",
    "const CONSUMER_SECRET = \"SEU_CONSUMER_SECRET\";",
    "const ACCESS_TOKEN = \"SEU_ACCESS_TOKEN\";",
    "const TOKEN_SECRET = \"SEU_TOKEN_SECRET\";",
    "",
    "// Codificação percentual da RFC 3986 (exigida na assinatura OAuth 1.0a).",
    "const encode = (value) =>",
    "  encodeURIComponent(value).replace(/[!'()*]/g, (c) => \"%\" + c.charCodeAt(0).toString(16).toUpperCase());",
    "",
    "function oauthHeader(method, url) {",
    "  const oauth = {",
    "    oauth_consumer_key: CONSUMER_KEY,",
    "    oauth_token: ACCESS_TOKEN,",
    "    oauth_signature_method: \"HMAC-SHA1\",",
    "    oauth_timestamp: String(Math.floor(Date.now() / 1000)),",
    "    oauth_nonce: crypto.randomBytes(16).toString(\"hex\"),",
    "    oauth_version: \"1.0\",",
    "  };",
    "",
    "  // Parâmetros da query + oauth_*, codificados e ordenados.",
    "  const normalized = [...url.searchParams.entries(), ...Object.entries(oauth)]",
    "    .map(([k, v]) => [encode(k), encode(v)])",
    "    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))",
    "    .map(([k, v]) => `${k}=${v}`)",
    "    .join(\"&\");",
    "",
    "  const baseString = [method, encode(`${url.origin}${url.pathname}`), encode(normalized)].join(\"&\");",
    "  const signingKey = `${encode(CONSUMER_SECRET)}&${encode(TOKEN_SECRET)}`;",
    "  const signature = crypto.createHmac(\"sha1\", signingKey).update(baseString).digest(\"base64\");",
    "",
    "  const params = { ...oauth, oauth_signature: signature };",
    "  return \"OAuth \" + Object.entries(params).map(([k, v]) => `${k}=\"${encode(v)}\"`).join(\", \");",
    "}",
    "",
    `const url = new URL(BASE_URL + ${jsString(input.path)});`,
    ...input.query
      .filter((q) => q.key)
      .map((q) => `url.searchParams.append(${jsString(q.key)}, ${jsString(q.value)});`),
  ];

  if (body) {
    lines.push("", json ? `const payload = ${json};` : `const payload = ${jsString(body)};`);
  }

  lines.push(
    "",
    "const response = await fetch(url, {",
    `  method: ${jsString(method)},`,
    "  headers: {",
    "    Accept: \"application/json\",",
    ...(body ? ["    \"Content-Type\": \"application/json\","] : []),
    ...(input.headers ?? [])
      .filter((h) => h.key)
      .map((h) => `    ${jsString(h.key)}: ${jsString(h.value)},`),
    `    Authorization: oauthHeader(${jsString(method)}, url),`,
    "  },",
    ...(body ? [json ? "  body: JSON.stringify(payload)," : "  body: payload,"] : []),
    "});",
    "",
    "console.log(response.status, await response.text());",
  );

  return { id: "javascript", label: "JavaScript", language: "javascript", code: lines.join("\n"), notes: [OAUTH_NOTE] };
}

/* ---------------------------------- Java ---------------------------------- */

function java(input: RestInput): Snippet {
  const body = bodyOf(input);
  const method = input.method.toUpperCase();
  const query = input.query.filter((q) => q.key);

  const lines = [
    "// Java 11+ (java.net.http). Sem bibliotecas externas.",
    "import java.net.URI;",
    "import java.net.URLEncoder;",
    "import java.net.http.HttpClient;",
    "import java.net.http.HttpRequest;",
    "import java.net.http.HttpResponse;",
    "import java.nio.charset.StandardCharsets;",
    "import java.security.SecureRandom;",
    "import java.util.ArrayList;",
    "import java.util.Base64;",
    "import java.util.LinkedHashMap;",
    "import java.util.List;",
    "import java.util.Map;",
    "import java.util.stream.Collectors;",
    "import javax.crypto.Mac;",
    "import javax.crypto.spec.SecretKeySpec;",
    "",
    "public class FluigRestExample {",
    `    private static final String BASE_URL = ${javaString(input.baseUrl)};`,
    "    private static final String CONSUMER_KEY = \"SUA_CONSUMER_KEY\";",
    "    private static final String CONSUMER_SECRET = \"SEU_CONSUMER_SECRET\";",
    "    private static final String ACCESS_TOKEN = \"SEU_ACCESS_TOKEN\";",
    "    private static final String TOKEN_SECRET = \"SEU_TOKEN_SECRET\";",
    "",
    "    // Codificação percentual da RFC 3986 (exigida na assinatura OAuth 1.0a).",
    "    private static String encode(String value) {",
    "        return URLEncoder.encode(value, StandardCharsets.UTF_8)",
    "                .replace(\"+\", \"%20\").replace(\"*\", \"%2A\").replace(\"%7E\", \"~\");",
    "    }",
    "",
    "    private static String oauthHeader(String method, String urlWithoutQuery, Map<String, String> query) throws Exception {",
    "        Map<String, String> oauth = new LinkedHashMap<>();",
    "        oauth.put(\"oauth_consumer_key\", CONSUMER_KEY);",
    "        oauth.put(\"oauth_token\", ACCESS_TOKEN);",
    "        oauth.put(\"oauth_signature_method\", \"HMAC-SHA1\");",
    "        oauth.put(\"oauth_timestamp\", String.valueOf(System.currentTimeMillis() / 1000));",
    "        oauth.put(\"oauth_nonce\", Long.toHexString(new SecureRandom().nextLong()) + Long.toHexString(System.nanoTime()));",
    "        oauth.put(\"oauth_version\", \"1.0\");",
    "",
    "        // Parâmetros da query + oauth_*, codificados e ordenados.",
    "        List<String[]> pairs = new ArrayList<>();",
    "        for (Map.Entry<String, String> e : query.entrySet()) pairs.add(new String[] {encode(e.getKey()), encode(e.getValue())});",
    "        for (Map.Entry<String, String> e : oauth.entrySet()) pairs.add(new String[] {encode(e.getKey()), encode(e.getValue())});",
    "        pairs.sort((a, b) -> a[0].equals(b[0]) ? a[1].compareTo(b[1]) : a[0].compareTo(b[0]));",
    "        String normalized = pairs.stream().map(p -> p[0] + \"=\" + p[1]).collect(Collectors.joining(\"&\"));",
    "",
    "        String baseString = method + \"&\" + encode(urlWithoutQuery) + \"&\" + encode(normalized);",
    "        String signingKey = encode(CONSUMER_SECRET) + \"&\" + encode(TOKEN_SECRET);",
    "        Mac mac = Mac.getInstance(\"HmacSHA1\");",
    "        mac.init(new SecretKeySpec(signingKey.getBytes(StandardCharsets.UTF_8), \"HmacSHA1\"));",
    "        String signature = Base64.getEncoder().encodeToString(mac.doFinal(baseString.getBytes(StandardCharsets.UTF_8)));",
    "",
    "        oauth.put(\"oauth_signature\", signature);",
    "        return \"OAuth \" + oauth.entrySet().stream()",
    "                .map(e -> e.getKey() + \"=\\\"\" + encode(e.getValue()) + \"\\\"\")",
    "                .collect(Collectors.joining(\", \"));",
    "    }",
    "",
    "    public static void main(String[] args) throws Exception {",
    `        String urlWithoutQuery = BASE_URL + ${javaString(input.path)};`,
    "        Map<String, String> query = new LinkedHashMap<>();",
    ...query.map((q) => `        query.put(${javaString(q.key)}, ${javaString(q.value)});`),
    "        String queryString = query.entrySet().stream()",
    "                .map(e -> encode(e.getKey()) + \"=\" + encode(e.getValue()))",
    "                .collect(Collectors.joining(\"&\"));",
    "        String fullUrl = queryString.isEmpty() ? urlWithoutQuery : urlWithoutQuery + \"?\" + queryString;",
    "",
    ...(body ? [`        String payload = ${javaString(body)};`, ""] : []),
    "        HttpRequest request = HttpRequest.newBuilder()",
    "                .uri(URI.create(fullUrl))",
    "                .header(\"Accept\", \"application/json\")",
    ...(body ? ["                .header(\"Content-Type\", \"application/json\")"] : []),
    ...(input.headers ?? [])
      .filter((h) => h.key)
      .map((h) => `                .header(${javaString(h.key)}, ${javaString(h.value)})`),
    `                .header("Authorization", oauthHeader(${javaString(method)}, urlWithoutQuery, query))`,
    `                .method(${javaString(method)}, ${body ? "HttpRequest.BodyPublishers.ofString(payload)" : "HttpRequest.BodyPublishers.noBody()"})`,
    "                .build();",
    "",
    "        HttpResponse<String> response = HttpClient.newHttpClient()",
    "                .send(request, HttpResponse.BodyHandlers.ofString());",
    "        System.out.println(response.statusCode() + \" \" + response.body());",
    "    }",
    "}",
  ];

  return {
    id: "java",
    label: "Java",
    language: "java",
    code: lines.join("\n"),
    notes: [
      OAUTH_NOTE,
      "A assinatura considera os parâmetros da query sem repetição de chaves. Se precisar repetir uma chave, ajuste a montagem de 'pairs'.",
    ],
  };
}

export function generateRestSnippets(input: RestInput): Snippet[] {
  return [curl(input), javascript(input), java(input)];
}
