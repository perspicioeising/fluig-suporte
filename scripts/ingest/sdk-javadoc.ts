import * as cheerio from "cheerio";
import { fetchText } from "./lib/http";
import { cleanSignature, parseSignature, squash } from "./lib/signature";
import type {
  NormalizedEntry,
  NormalizedParameter,
  ParseResult,
  SourceDefinition,
} from "./lib/types";

const BASE = "https://api.fluig.com/old/sdk";
const SERVICE_PACKAGE = "com/fluig/sdk/service/";
const ENTRY_POINT_CLASS = "com/fluig/sdk/api/FluigAPI.html";

export const SDK_SOURCE: SourceDefinition = {
  slug: "api-fluig-sdk",
  name: "api.fluig.com - SDK (Javadoc)",
  kind: "sdk",
  url: `${BASE}/`,
};

const nonEmpty = (value: string) => (value ? value : null);

export function parseJavadocClass(href: string, html: string): ParseResult {
  const $ = cheerio.load(html);
  const entries: NormalizedEntry[] = [];
  const warnings: string[] = [];

  const title = squash($("h2.title").first().text());
  const className = title.replace(/^(Interface|Class|Enum|Annotation Type)\s+/i, "");
  const classDescription = squash($("div.description .block").first().text());
  const pageUrl = `${BASE}/${href}`;
  const seen = new Map<string, number>();

  $("pre.methodSignature").each((_, pre) => {
    const li = $(pre).closest("li");
    const methodName = squash(li.children("h4").first().text());
    const rawSignature = $(pre).text();
    const signature = parseSignature(rawSignature);
    if (!methodName || !signature) {
      warnings.push(`${className}: assinatura não interpretada em "${squash(rawSignature).slice(0, 80)}"`);
      return;
    }

    const summary = nonEmpty(squash(li.children("div.block").first().text()));
    const deprecationNote = nonEmpty(squash(li.find("div.deprecationBlock").first().text()));

    // <dl> alterna <dt> (rótulo) e <dd> (valores)
    const paramDocs = new Map<string, string>();
    let returnDoc: string | null = null;
    const throwsDocs: string[] = [];
    let section: "param" | "return" | "throws" | "other" = "other";

    li.children("dl").first().children().each((__, node) => {
      const tag = (node as { tagName?: string }).tagName;
      const element = $(node);
      if (tag === "dt") {
        const label = element.find("span").first().attr("class") ?? "";
        section = label.includes("paramLabel")
          ? "param"
          : label.includes("returnLabel")
            ? "return"
            : label.includes("throwsLabel")
              ? "throws"
              : "other";
        return;
      }
      if (tag !== "dd") return;

      const text = squash(element.text());
      if (section === "param") {
        const code = squash(element.find("code").first().text());
        paramDocs.set(code, squash(text.replace(code, "").replace(/^\s*-\s*/, "")));
      } else if (section === "return") {
        returnDoc = text;
      } else if (section === "throws") {
        throwsDocs.push(text);
      }
    });

    const parameters: NormalizedParameter[] = signature.params.map((p) => ({
      direction: "input",
      location: "argument",
      name: p.name,
      data_type: nonEmpty(p.type),
      is_required: true,
      description: nonEmpty(paramDocs.get(p.name) ?? ""),
      example: null,
    }));

    const returnType = signature.prefix.replace(/\b(public|abstract|static|default|final)\b/g, "").trim();
    if (returnType && returnType !== "void") {
      parameters.push({
        direction: "output",
        location: "return",
        name: "retorno",
        data_type: returnType,
        is_required: false,
        description: returnDoc,
        example: null,
      });
    }

    const cleaned = cleanSignature(rawSignature);
    const baseSlug = `${className}.${methodName}(${signature.params.map((p) => p.type).join(",")})`;
    const count = (seen.get(baseSlug) ?? 0) + 1;
    seen.set(baseSlug, count);

    const description = [
      classDescription ? `${className}: ${classDescription}` : null,
      throwsDocs.length ? `Exceções: ${throwsDocs.join("; ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    entries.push({
      slug: count === 1 ? baseSlug : `${baseSlug}#${count}`,
      kind: "sdk",
      name: `${className}.${methodName}`,
      http_method: null,
      // Para SDK/SOAP o campo "path" guarda a assinatura do método.
      path: cleaned,
      summary,
      description: nonEmpty(description),
      is_deprecated: Boolean(deprecationNote),
      compatibility_notes: deprecationNote,
      tags: [className, "SDK"],
      examples: [],
      parameters,
      source_url: pageUrl,
      document_url: pageUrl,
      document_title: `Fluig SDK (Javadoc) - ${className}`,
    });
  });

  return { entries, warnings };
}

export async function ingestSdk(limit?: number): Promise<ParseResult> {
  const index = cheerio.load(await fetchText(`${BASE}/allclasses.html`));
  const hrefs = [
    ...new Set(
      index("a")
        .map((_, a) => index(a).attr("href") ?? "")
        .get()
        // Serviços do SDK + a classe FluigAPI (ponto de entrada: new FluigAPI().getXService()).
        .filter((h) => (h.startsWith(SERVICE_PACKAGE) || h === ENTRY_POINT_CLASS) && h.endsWith(".html")),
    ),
  ].sort();
  const targets = limit ? hrefs.slice(0, limit) : hrefs;
  console.log(`  ${hrefs.length} classes no pacote de serviços${limit ? ` (processando ${targets.length})` : ""}`);

  const entries: NormalizedEntry[] = [];
  const warnings: string[] = [];

  for (const href of targets) {
    try {
      const result = parseJavadocClass(href, await fetchText(`${BASE}/${href}`));
      entries.push(...result.entries);
      warnings.push(...result.warnings);
    } catch (error) {
      warnings.push(`Falha ao baixar ${href}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { entries, warnings, sources: [SDK_SOURCE] };
}
