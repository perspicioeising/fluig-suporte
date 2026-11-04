import "server-only";
import { BlockList, isIP } from "node:net";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

/**
 * Proteção contra SSRF.
 *
 * 1. Faixas privadas, loopback, link-local (inclui metadados de nuvem
 *    169.254.169.254), CGNAT, multicast e reservadas são sempre bloqueadas.
 * 2. A validação do IP acontece no momento da CONEXÃO (função `lookup`),
 *    o que também impede DNS rebinding.
 * 3. Redirecionamentos NÃO são seguidos.
 */

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

const blocked = new BlockList();
const V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
for (const [net, prefix] of V4) blocked.addSubnet(net, prefix, "ipv4");

const V6: [string, number][] = [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];
for (const [net, prefix] of V6) blocked.addSubnet(net, prefix, "ipv6");

/** true se o endereço é público e roteável. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;

  // IPv4 mapeado em IPv6 (::ffff:a.b.c.d)
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return !blocked.check(mapped[1], "ipv4");

  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** Valida o host de uma URL antes de qualquer conexão (literal de IP, localhost). */
export function assertSafeHost(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SsrfError("Somente http e https são permitidos.");
  }
  if (url.username || url.password) {
    throw new SsrfError("URL com credenciais embutidas não é permitida.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new SsrfError("Destino interno não autorizado.");
  }
  if (isIP(host) !== 0 && !isPublicAddress(host)) {
    throw new SsrfError("Endereço IP interno não autorizado.");
  }
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address?: string | dns.LookupAddress[],
  family?: number,
) => void;

/** `lookup` seguro: resolve e recusa qualquer endereço não público. */
function safeLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: LookupCallback,
) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
      return callback(new SsrfError("O destino resolve para um endereço interno não autorizado."));
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

export type SafeResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
  truncated: boolean;
};

const HOP_BY_HOP = new Set([
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "proxy-authorization",
  "proxy-connection",
  "accept-encoding",
]);

export function sanitizeRequestHeaders(headers: Record<string, string>) {
  const clean: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) continue;
    if (/[\r\n]/.test(value)) continue;
    clean[name] = value;
  }
  return clean;
}

export async function safeRequest(options: {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<SafeResponse> {
  const { url, method, body, timeoutMs = 30_000, maxBytes = 2 * 1024 * 1024 } = options;
  assertSafeHost(url);

  const transport = url.protocol === "https:" ? https : http;
  const headers = {
    ...sanitizeRequestHeaders(options.headers),
    "accept-encoding": "gzip, deflate, br",
  } as Record<string, string>;
  if (body !== undefined) headers["content-length"] = String(Buffer.byteLength(body));

  return new Promise<SafeResponse>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method,
        headers,
        lookup: safeLookup as unknown as net_lookup,
        agent: false,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        let truncated = false;

        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxBytes) {
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });

        const finish = () => {
          let body = Buffer.concat(chunks);
          const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
          try {
            if (!truncated) {
              if (encoding === "gzip") body = gunzipSync(body, { maxOutputLength: maxBytes });
              else if (encoding === "deflate") body = inflateSync(body, { maxOutputLength: maxBytes });
              else if (encoding === "br") body = brotliDecompressSync(body, { maxOutputLength: maxBytes });
            }
          } catch {
            truncated = true;
          }

          const outHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) outHeaders[k] = Array.isArray(v) ? v.join(", ") : String(v);
          }
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? "",
            headers: outHeaders,
            body,
            truncated,
          });
        };

        res.on("end", finish);
        res.on("close", () => {
          if (truncated) finish();
        });
        res.on("error", reject);
      },
    );

    req.on("timeout", () => req.destroy(new Error("ETIMEDOUT")));
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// Tipo do callback `lookup` aceito pelo node:http (evita depender de tipos internos).
type net_lookup = NonNullable<http.RequestOptions["lookup"]>;
