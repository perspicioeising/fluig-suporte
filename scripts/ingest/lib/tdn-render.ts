import type { AnyNode } from "domhandler";
import type { CheerioAPI } from "cheerio";
import { squash } from "./signature";

const MAX_CHUNK_CHARS = 1800;

type Doc = CheerioAPI;

function tagOf(el: AnyNode): string | null {
  return el.type === "tag" || el.type === "script" || el.type === "style"
    ? (el as { tagName: string }).tagName
    : null;
}

function codeLines($: Doc, el: AnyNode): string[] {
  const node = $(el);
  const lines = node
    .find("td.code div.line")
    .map((_, line) => $(line).text().replace(/\u00a0/g, " "))
    .get();
  const fallback = lines.length
    ? lines
    : node
        .find("div.line")
        .map((_, line) => $(line).text().replace(/\u00a0/g, " "))
        .get();
  return ["```", ...fallback, "```"];
}

/** Converte um nó do Confluence em linhas de texto, preservando listas, tabelas e código. */
export function renderNode($: Doc, el: AnyNode): string[] {
  if (el.type === "text") {
    const t = squash((el as { data?: string }).data);
    return t ? [t] : [];
  }
  const tag = tagOf(el);
  if (!tag || tag === "script" || tag === "style") return [];

  const node = $(el);
  const cls = node.attr("class") ?? "";

  if (/toc-macro/.test(cls)) return [];
  if (/\bsyntaxhighlighter\b/.test(cls) || (tag === "div" && /\bcode\b/.test(cls) && node.find("div.line").length)) {
    return codeLines($, el);
  }
  if (tag === "pre") {
    return ["```", node.text().replace(/\u00a0/g, " ").trimEnd(), "```"];
  }
  if (tag === "table") {
    return node
      .find("tr")
      .map((_, tr) => {
        const cells = $(tr)
          .children("th,td")
          .map((__, c) => squash($(c).text()))
          .get()
          .filter((c) => c.length > 0);
        return cells.length ? cells.join(" | ") : "";
      })
      .get()
      .filter(Boolean);
  }
  if (tag === "ul" || tag === "ol") {
    return node
      .children("li")
      .map((_, li) => `- ${squash($(li).text())}`)
      .get()
      .filter((l) => l !== "- ");
  }
  if (tag === "p" || /^h[1-6]$/.test(tag) || tag === "li") {
    const t = squash(node.text());
    return t ? [t] : [];
  }
  return node
    .contents()
    .toArray()
    .flatMap((child) => renderNode($, child));
}

export type Chunk = { headingPath: string[]; content: string };

/**
 * Percorre o conteúdo principal e gera trechos por seção (h1..h6).
 * `stopAtHeading`: interrompe quando um título casar (ex.: início da referência de métodos).
 */
export function chunkWikiContent(
  $: Doc,
  pageTitle: string,
  stopAtHeading?: RegExp,
): Chunk[] {
  // Algumas páginas têm o conteúdo em #main-content .wiki-content; outras (ex.: tabelas grandes
  // como o Dicionário de Logs) o conteúdo fica direto em #main-content. Usa o que tiver filhos.
  const inner = $("#main-content .wiki-content").first();
  const root = inner.length && inner.children().length ? inner : $("#main-content").first();
  const chunks: Chunk[] = [];
  const path: string[] = [];
  let buffer: string[] = [];
  let size = 0;

  const flush = () => {
    const body = buffer.join("\n").trim();
    buffer = [];
    size = 0;
    if (body.length < 40) return;
    const heading = path.length ? ` > ${path.join(" > ")}` : "";
    chunks.push({
      headingPath: [...path],
      content: `${pageTitle}${heading}\n\n${body}`,
    });
  };

  let stopped = false;
  root.children().each((_, el) => {
    if (stopped) return;
    const tag = tagOf(el);
    if (!tag) return;

    const level = tag.match(/^h([1-6])$/)?.[1];
    if (level) {
      const title = squash($(el).text());
      if (stopAtHeading?.test(title)) {
        stopped = true;
        return;
      }
      flush();
      if (/^índice$/i.test(title)) {
        path.length = 0;
        return;
      }
      path.length = Math.max(0, Number(level) - 1);
      path[Number(level) - 1] = title;
      // Remove lacunas se algum nível foi pulado
      for (let i = path.length - 1; i >= 0; i--) if (!path[i]) path.splice(i, 1);
      return;
    }

    for (const line of renderNode($, el)) {
      if (size + line.length > MAX_CHUNK_CHARS && size > 0) flush();
      buffer.push(line);
      size += line.length + 1;
    }
  });
  flush();

  return chunks;
}
