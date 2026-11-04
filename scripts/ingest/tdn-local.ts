import * as cheerio from "cheerio";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chunkWikiContent } from "./lib/tdn-render";
import { cleanSignature, parseSignature, squash } from "./lib/signature";
import type {
  NormalizedEntry,
  NormalizedExample,
  NormalizedParameter,
  ParseResult,
  ParsedDocument,
  SourceDefinition,
} from "./lib/types";

/**
 * Importa páginas do TDN SALVAS MANUALMENTE (o TDN bloqueia acesso automatizado
 * via Cloudflare; não tentamos contornar). A página é identificada pelo
 * ajs-page-id presente no próprio HTML.
 */

type PageConfig = {
  source: SourceDefinition;
  kind: "soap" | "docs";
  /** Páginas-índice: guarda também "título: URL" de cada link para subpáginas do TDN. */
  includeLinks?: boolean;
};

// Fontes já cadastradas pela migration 0002 mantêm o slug original.
const PAGES: Record<string, PageConfig> = {
  "73084007": {
    kind: "docs",
    source: { slug: "tdn-73084007", name: "TDN - Utilização de Webservices", kind: "docs", url: "https://tdn.totvs.com/pages/viewpage.action?pageId=73084007" },
  },
  "198934765": {
    kind: "docs",
    source: { slug: "tdn-198934765", name: "TDN - Consumo de serviços na API pública e no componente SDK", kind: "docs", url: "https://tdn.totvs.com/pages/viewpage.action?pageId=198934765" },
  },
  "258277672": {
    kind: "docs",
    source: { slug: "tdn-fluig-api", name: "TDN - Fluig API", kind: "docs", url: "https://tdn.totvs.com/display/public/fluig/Fluig+API" },
  },
  "239041233": {
    kind: "docs",
    source: { slug: "tdn-239041233", name: "TDN - Autorização para client de Serviços REST", kind: "docs", url: "https://tdn.totvs.com/pages/viewpage.action?pageId=239041233" },
  },
  "840778303": {
    kind: "docs",
    includeLinks: true,
    source: { slug: "tdn-840778303", name: "TDN - Integrações (índice)", kind: "docs", url: "https://tdn.totvs.com/pages/viewpage.action?pageId=840778303" },
  },
  "662867789": {
    kind: "soap",
    source: { slug: "tdn-662867789", name: "TDN - Documentação dos Web Services", kind: "soap", url: "https://tdn.totvs.com/pages/viewpage.action?pageId=662867789" },
  },
};

export const SOAP_SOURCE_SLUG = "tdn-662867789";

const SERVICE_NAME = /^[A-Za-z0-9]+Service$/;

type Doc = cheerio.CheerioAPI;

function parseSoapMethods(
  $: Doc,
  pageUrl: string,
  pageTitle: string,
): { entries: NormalizedEntry[]; warnings: string[] } {
  const entries: NormalizedEntry[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();

  let service: { name: string; description: string | null } | null = null;

  $("#main-content .wiki-content")
    .first()
    .children()
    .each((_, el) => {
      const tag = (el as { tagName?: string }).tagName ?? "";
      const node = $(el);

      if (tag === "h1") {
        const title = squash(node.text());
        service = SERVICE_NAME.test(title) ? { name: title, description: null } : null;
        return;
      }
      if (!service) return;

      if (tag === "p" && !service.description) {
        const text = squash(node.text());
        if (text) service.description = text;
      }

      const tables = tag === "table" ? [el] : node.find("table").toArray();
      for (const table of tables) {
        $(table)
          .find("tr")
          .each((__, tr) => {
            const cells = $(tr).children("td");
            if (cells.length < 2) return;

            const methodName = squash(cells.eq(0).text());
            const content = cells.eq(1);
            if (!methodName || !/Método\s*:/i.test(content.text())) return;

            const description: string[] = [];
            const extras: string[] = [];
            const examples: NormalizedExample[] = [];
            const listed = new Map<string, string>();
            let signatureText = "";
            let returnText = "";
            let lastLabel = "";
            let mode: "desc" | "sig" | "params" | "ret" | "after" = "desc";

            // Blocos de conteúdo em ordem de documento, ignorando o que está
            // dentro de tabelas aninhadas (blocos de código XML).
            const outerTable = $(tr).closest("table")[0];
            const blocks = content
              .find("p, ul, ol, table")
              .toArray()
              .filter((b) => {
                const isTable = (b as { tagName?: string }).tagName === "table";
                const owner = isTable ? $(b).parent().closest("table")[0] : $(b).closest("table")[0];
                return owner === outerTable;
              });

            for (const child of blocks) {
              const childTag = (child as { tagName?: string }).tagName ?? "";

              if (childTag === "table") {
                const code = $(child)
                  .find("div")
                  .filter((__, d) => $(d).children("code").length > 0)
                  .map((__, d) => $(d).text().replace(/\u00a0/g, " "))
                  .get()
                  .join("\n")
                  .trimEnd();
                if (code) {
                  examples.push({
                    title: lastLabel && lastLabel.length <= 80 ? lastLabel : "Exemplo",
                    language: code.trimStart().startsWith("<") ? "xml" : "text",
                    code,
                  });
                }
                continue;
              }

              const text = squash($(child).text());
              if (!text) continue;
              if (/^(Estrutura|Exemplo)/i.test(text) && text.length <= 80) {
                lastLabel = text;
                continue;
              }

              const inlineSignature = text.match(/^Método\s*:\s*(\S.*)$/i);
              if (inlineSignature) {
                signatureText = inlineSignature[1];
                mode = "after";
                continue;
              }
              if (/^Método\s*:?$/i.test(text)) { mode = "sig"; continue; }
              if (/^Par[âa]metros\s*:?$/i.test(text)) { mode = "params"; continue; }
              if (/^Retorno\s*:/i.test(text)) {
                returnText = text.replace(/^Retorno\s*:\s*/i, "");
                mode = returnText ? "after" : "ret";
                continue;
              }

              if (childTag === "ul" || childTag === "ol") {
                $(child).children("li").each((___, li) => {
                  const line = squash($(li).text());
                  const colon = line.indexOf(":");
                  if (colon > 0) listed.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
                  else if (line) extras.push(line);
                });
                continue;
              }

              if (mode === "desc") description.push(text);
              else if (mode === "sig") { signatureText = text; mode = "after"; }
              else if (mode === "ret") { returnText = text; mode = "after"; }
              else extras.push(text);
            }

            const signature = parseSignature(signatureText);
            if (!signature) {
              warnings.push(`${service!.name}.${methodName}: assinatura não encontrada/interpretada.`);
              return;
            }
            // Divergências internas da própria documentação do TDN: registradas
            // como nota para que o usuário confira no WSDL do ambiente.
            const notes: string[] = [];
            if (signature.name.toLowerCase() !== methodName.toLowerCase()) {
              warnings.push(`${service!.name}: nome da linha "${methodName}" difere da assinatura "${signature.name}".`);
              notes.push(
                `Inconsistência na documentação do TDN: o método aparece como "${methodName}", mas a assinatura documentada é "${signature.name}". Confira o WSDL do seu ambiente.`,
              );
            }

            const parameters: NormalizedParameter[] = signature.params.map((p) => ({
              direction: "input",
              location: "argument",
              name: p.name,
              data_type: p.type || null,
              is_required: true,
              description: listed.get(p.name) ?? null,
              example: null,
            }));
            for (const [name, desc] of listed) {
              if (!signature.params.some((p) => p.name === name)) {
                warnings.push(`${service!.name}.${methodName}: parâmetro "${name}" documentado mas ausente na assinatura.`);
                notes.push(
                  `Inconsistência na documentação do TDN: o parâmetro "${name}" está descrito, mas não consta na assinatura. Confira o WSDL do seu ambiente.`,
                );
                parameters.push({ direction: "input", location: "argument", name, data_type: null, is_required: false, description: desc, example: null });
              }
            }
            if (returnText) {
              parameters.push({
                direction: "output",
                location: "return",
                name: "retorno",
                data_type: returnText.replace(/\.$/, ""),
                is_required: false,
                description: null,
                example: null,
              });
            }

            const base = `${service!.name}.${methodName}`;
            const count = (seen.get(base) ?? 0) + 1;
            seen.set(base, count);

            entries.push({
              slug: count === 1 ? base : `${base}#${count}`,
              kind: "soap",
              name: base,
              http_method: null,
              // Para SDK/SOAP o campo "path" guarda a assinatura do método.
              path: cleanSignature(signatureText),
              summary: description.join(" ") || null,
              description:
                [service!.description ? `${service!.name}: ${service!.description}` : null, ...extras]
                  .filter(Boolean)
                  .join("\n") || null,
              is_deprecated: false,
              compatibility_notes: notes.length ? notes.join(" ") : null,
              tags: [service!.name, "SOAP"],
              examples,
              parameters,
              source_url: pageUrl,
              document_url: pageUrl,
              document_title: pageTitle,
            });
          });
      }
    });

  return { entries, warnings };
}

export function ingestTdnLocal(dir: string): ParseResult {
  const entries: NormalizedEntry[] = [];
  const documents: ParsedDocument[] = [];
  const warnings: string[] = [];
  const sources: SourceDefinition[] = [];

  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".html"));

  for (const file of files) {
    const $ = cheerio.load(readFileSync(join(dir, file), "utf8"));
    const pageId = $('meta[name="ajs-page-id"]').attr("content");
    const config = pageId ? PAGES[pageId] : undefined;

    if (!pageId || !$("#main-content").length) {
      console.log(`  (ignorado) ${file}: não é uma página do TDN.`);
      continue;
    }
    if (!config) {
      warnings.push(`${file}: pageId ${pageId} sem configuração, ignorado.`);
      continue;
    }

    const pageUrl = $('link[rel="canonical"]').attr("href") ?? config.source.url;
    const pageTitle = squash($("title").text()).replace(/\s*-\s*TOTVS Fluig\s*-\s*TDN$/i, "");
    sources.push({ ...config.source, url: config.source.url });

    if (config.kind === "soap") {
      const result = parseSoapMethods($, pageUrl, pageTitle);
      entries.push(...result.entries);
      warnings.push(...result.warnings);
      console.log(`  ${file}: ${result.entries.length} métodos SOAP`);

      // Introdução/segurança/uso (antes do primeiro serviço) vira texto de conhecimento.
      const chunks = chunkWikiContent($, pageTitle, SERVICE_NAME);
      if (chunks.length) {
        documents.push({ sourceSlug: config.source.slug, url: `${pageUrl}#introducao`, title: `${pageTitle} (introdução)`, chunks });
      }
    } else {
      const chunks = chunkWikiContent($, pageTitle);

      if (config.includeLinks) {
        const seen = new Set<string>();
        const lines: string[] = [];
        $("#main-content .wiki-content a[href]").each((_, a) => {
          const href = $(a).attr("href") ?? "";
          const label = squash($(a).text());
          if (!label || seen.has(href) || !/^https:\/\/tdn\.totvs\.com\//.test(href)) return;
          seen.add(href);
          lines.push(`- ${label}: ${href}`);
        });
        if (lines.length > 0) {
          chunks.push({
            headingPath: ["Páginas relacionadas"],
            content: `${pageTitle} > Páginas relacionadas\n\nPáginas de documentação oficial sobre integração listadas no TDN:\n${lines.join("\n")}`,
          });
        }
      }

      console.log(`  ${file}: ${chunks.length} trechos`);
      documents.push({ sourceSlug: config.source.slug, url: pageUrl, title: pageTitle, chunks });
    }
  }

  return { entries, warnings, sources, documents };
}
