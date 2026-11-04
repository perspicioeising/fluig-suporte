import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/** OAuth 1.0a com HMAC-SHA1 (RFC 5849). O Fluig usa OAuth 1.0a na API pública. */

export type OAuth1Credentials = {
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
};

/** Codificação percentual da RFC 3986 (mais estrita que encodeURIComponent). */
const enc = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export function buildOAuth1Header(options: {
  method: string;
  url: URL;
  credentials: OAuth1Credentials;
  /** Parâmetros de corpo application/x-www-form-urlencoded (se houver). */
  formParams?: [string, string][];
  /** Somente testes: fixa nonce/timestamp. */
  nonce?: string;
  timestamp?: string;
}): string {
  const { method, url, credentials } = options;

  const oauth: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: options.nonce ?? randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: options.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
  };
  if (credentials.token) oauth.oauth_token = credentials.token;

  const pairs: [string, string][] = [
    ...url.searchParams.entries(),
    ...(options.formParams ?? []),
    ...Object.entries(oauth),
  ];
  const normalized = pairs
    .map(([k, v]) => [enc(k), enc(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const defaultPort = url.protocol === "https:" ? "443" : "80";
  const host = url.port && url.port !== defaultPort ? `${url.hostname}:${url.port}` : url.hostname;
  const baseUrl = `${url.protocol}//${host.toLowerCase()}${url.pathname}`;

  const baseString = [method.toUpperCase(), enc(baseUrl), enc(normalized)].join("&");
  const signingKey = `${enc(credentials.consumerSecret)}&${enc(credentials.tokenSecret ?? "")}`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");

  const header = Object.entries({ ...oauth, oauth_signature: signature })
    .map(([k, v]) => `${enc(k)}="${enc(v)}"`)
    .join(", ");
  return `OAuth ${header}`;
}
