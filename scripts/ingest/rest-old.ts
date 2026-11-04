import * as cheerio from "cheerio";
import { fetchText } from "./lib/http";
import type {
  NormalizedEntry,
  NormalizedExample,
  NormalizedParameter,
  ParseResult,
} from "./lib/types";

export const REST_OLD_SOURCE_SLUG = "api-fluig-old";
const BASE = "https://api.fluig.com/old";

const text = (value: string | undefined) => {
  const t = value?.replace(/\s+/g, " ").trim();
  return t ? t : null;
};

/** Mantém a formatação original (quebras e indentação) de blocos de código. */
const codeText = (value: string) => value.replace(/^\s*\n/, "").replace(/\s+$/, "");

type ResourceLink = { name: string; href: string };

export function parseIndex(html: string): ResourceLink[] {
  const $ = cheerio.load(html);
  const links: ResourceLink[] = [];

  $("tr.clickable-row[data-href]").each((_, row) => {
    const href = $(row).attr("data-href");
    const name = text($(row).find("td").first().text());
    if (href && name && /^resource_.+\.html$/.test(href)) {
      links.push({ name, href });
    }
  });

  return links;
}

const PARAM_LOCATIONS: Record<string, NormalizedParameter["location"]> = {
  path: "path",
  query: "query",
  header: "header",
  form: "body",
  formdata: "body",
  body: "body",
};

export function parseResourcePage(
  resourceName: string,
  href: string,
  html: string,
): ParseResult {
  const $ = cheerio.load(html);
  const entries: NormalizedEntry[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();

  const pageUrl = `${BASE}/${href}`;
  const resourceDescription = text($(".content__main > p").first().text());

  $(".content__main > div[id^='resource_']").each((_, el) => {
    const block = $(el);
    const id = block.attr("id") ?? "";

    const method = text(block.find(".resource-method").first().text());
    const path = text(block.find(".resource-path").first().text());
    if (!method || !path) {
      warnings.push(`${href}#${id}: método ou caminho ausente, ignorado.`);
      return;
    }

    // resource_<Recurso>_<operação>_<MÉTODO>
    const prefix = `resource_${resourceName}_`;
    const suffix = `_${method}`;
    const operation =
      id.startsWith(prefix) && id.endsWith(suffix) && id.length > prefix.length + suffix.length
        ? id.slice(prefix.length, id.length - suffix.length)
        : `${method} ${path}`;

    const description = text(
      block
        .children("p")
        .map((__, p) => $(p).text())
        .get()
        .join(" "),
    );

    const parameters: NormalizedParameter[] = [];
    const examples: NormalizedExample[] = [];

    block.find("table").each((__, table) => {
      const caption = text($(table).find("caption").text()) ?? "";
      const rows = $(table).find("tbody tr");

      if (/^request parameters$/i.test(caption)) {
        rows.each((___, row) => {
          const cells = $(row).find("td");
          const name = text(cells.eq(0).text());
          if (!name) return;

          const rawType = (text(cells.eq(1).text()) ?? "").toLowerCase();
          let location = PARAM_LOCATIONS[rawType];
          if (!location) {
            warnings.push(`${href}#${id}: tipo de parâmetro desconhecido "${rawType}" em "${name}" (mapeado como query).`);
            location = "query";
          }

          const descCell = cells.eq(2);
          const required = descCell.find(".required").length > 0;
          descCell.find(".required").remove();

          parameters.push({
            direction: "input",
            location,
            name,
            data_type: text(cells.eq(3).text()),
            is_required: required,
            description: text(descCell.text()),
            example: null,
          });
        });
        return;
      }

      const isRequest = /^request body$/i.test(caption);
      const isResponse = /^response body$/i.test(caption);
      if (!isRequest && !isResponse) return;

      rows.each((___, row) => {
        const cells = $(row).find("td");
        const mediaType = text(cells.eq(0).text());
        const dataType = text(cells.eq(1).text());
        const descCell = cells.eq(2);

        const pre = descCell.find("pre code").first();
        const example = pre.length ? codeText(pre.text()) : null;
        const heading = text(descCell.find("h4").first().text());

        if (example) {
          const langClass = pre.attr("class")?.match(/lang-([a-z0-9]+)/i)?.[1];
          examples.push({
            title: heading ?? (isRequest ? "Request body" : "Response body"),
            language: langClass ?? "text",
            code: example,
          });
        }

        const dataTypeName = dataType?.replace(/\s*\((JSON|XML)\)\s*$/i, "") ?? null;
        parameters.push({
          direction: isRequest ? "input" : "output",
          location: isRequest ? "body" : "return",
          name: dataTypeName ?? "body",
          data_type: [mediaType, dataType].filter(Boolean).join(" | ") || null,
          is_required: false,
          description: null,
          example,
        });
      });
    });

    const baseSlug = `${resourceName}:${id}`;
    const count = (seen.get(baseSlug) ?? 0) + 1;
    seen.set(baseSlug, count);

    entries.push({
      slug: count === 1 ? baseSlug : `${baseSlug}#${count}`,
      kind: "rest_old",
      name: operation,
      http_method: method.toUpperCase(),
      path,
      summary: description,
      description: resourceDescription,
      is_deprecated: false,
      tags: [resourceName],
      examples,
      parameters,
      source_url: `${pageUrl}#${id}`,
      document_url: pageUrl,
      document_title: `Fluig API (old) - ${resourceName}`,
    });
  });

  return { entries, warnings };
}

export async function ingestRestOld(limit?: number): Promise<ParseResult> {
  const index = parseIndex(await fetchText(`${BASE}/`));
  const targets = limit ? index.slice(0, limit) : index;
  console.log(`  ${index.length} recursos no índice${limit ? ` (processando ${targets.length})` : ""}`);

  const entries: NormalizedEntry[] = [];
  const warnings: string[] = [];

  for (const [i, link] of targets.entries()) {
    try {
      const html = await fetchText(`${BASE}/${link.href}`);
      const result = parseResourcePage(link.name, link.href, html);
      entries.push(...result.entries);
      warnings.push(...result.warnings);
      if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${targets.length} páginas`);
    } catch (error) {
      warnings.push(`Falha ao baixar ${link.href}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { entries, warnings };
}
