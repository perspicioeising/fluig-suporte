/**
 * Ingestão da Central de Atendimento TOTVS (Zendesk Help Center) — artigos públicos do Fluig.
 *
 * Diferente do TDN (bloqueado por Cloudflare, exige HTML salvo à mão), a Central roda Zendesk
 * e expõe uma API pública de Help Center que responde sem login. Então aqui a ingestão é
 * automática, direto do servidor: pagina a categoria do Fluig e converte o corpo HTML de cada
 * artigo em trechos de texto para a base de conhecimento.
 *
 * Só leitura de conteúdo público oficial. Nada é inventado.
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { ParsedDocument, ParseResult, SourceDefinition } from "./lib/types";
import { squash } from "./lib/signature";

/** Categoria "TOTVS Fluig Plataforma" no Help Center da Central de Atendimento. */
const FLUIG_CATEGORY_ID = "4661069428631";
const BASE = "https://centraldeatendimento.totvs.com/api/v2/help_center/pt-br";
const PER_PAGE = 100;
const MAX_PAGES = 50; // teto de segurança (até 5000 artigos)
const MAX_CHUNK_CHARS = 1800;

export const CENTRAL_SOURCE_PREFIX = "central-";

type ZendeskArticle = {
  id: number;
  html_url: string;
  name: string;
  title: string;
  body: string | null;
  label_names?: string[];
  draft?: boolean;
};

type ArticlesPage = {
  articles: ZendeskArticle[];
  page: number;
  page_count: number;
  next_page: string | null;
};

async function fetchArticles(limit?: number): Promise<ZendeskArticle[]> {
  const all: ZendeskArticle[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE}/categories/${FLUIG_CATEGORY_ID}/articles.json?per_page=${PER_PAGE}&page=${page}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ao listar artigos (página ${page}).`);
    const data = (await res.json()) as ArticlesPage;
    all.push(...(data.articles ?? []));
    if (limit && all.length >= limit) return all.slice(0, limit);
    if (!data.next_page || page >= data.page_count) break;
  }
  return all;
}

/** Converte o HTML do corpo do artigo em texto corrido, preservando listas e blocos de código. */
function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  const lines: string[] = [];

  const tagOf = (el: AnyNode): string | null =>
    el.type === "tag" ? (el as { tagName: string }).tagName.toLowerCase() : null;

  const walkBlock = (el: AnyNode) => {
    const tag = tagOf(el);
    if (!tag) {
      // nó de texto solto no topo
      if (el.type === "text") {
        const t = squash((el as { data?: string }).data);
        if (t) lines.push(t);
      }
      return;
    }
    const $el = $(el);
    if (tag === "pre" || tag === "code") {
      const code = $el.text().replace(/\u00a0/g, " ").trimEnd();
      if (code.trim()) lines.push("```", code, "```");
      return;
    }
    if (tag === "ul" || tag === "ol") {
      $el.children("li").each((_, li) => {
        const t = squash($(li).text());
        if (t) lines.push(`- ${t}`);
      });
      return;
    }
    if (tag === "table") {
      $el.find("tr").each((_, tr) => {
        const cells = $(tr)
          .find("th,td")
          .map((_, c) => squash($(c).text()))
          .get()
          .filter(Boolean);
        if (cells.length) lines.push(cells.join(" | "));
      });
      return;
    }
    // parágrafos, títulos, divs: texto achatado
    const t = squash($el.text());
    if (t) lines.push(t);
  };

  // Percorre os blocos de nível superior; se não houver, usa o texto todo.
  const blocks = $.root().children().toArray();
  if (blocks.length > 0) {
    for (const el of blocks) walkBlock(el);
  } else {
    const t = squash($.root().text());
    if (t) lines.push(t);
  }
  return lines.join("\n");
}

/** Quebra o texto do artigo em trechos de até MAX_CHUNK_CHARS, sem cortar no meio de linha. */
function chunkText(title: string, text: string): ParsedDocument["chunks"] {
  const chunks: ParsedDocument["chunks"] = [];
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  let buffer = "";
  const flush = () => {
    const content = `${title}\n\n${buffer.trim()}`;
    if (buffer.trim()) chunks.push({ headingPath: [title], content });
    buffer = "";
  };
  for (const p of paragraphs) {
    if (buffer.length + p.length + 2 > MAX_CHUNK_CHARS && buffer) flush();
    buffer += (buffer ? "\n\n" : "") + p;
  }
  flush();
  // Artigo sem parágrafos detectáveis: um único trecho com o texto inteiro (truncado).
  if (chunks.length === 0 && text.trim()) {
    chunks.push({ headingPath: [title], content: `${title}\n\n${text.trim()}`.slice(0, MAX_CHUNK_CHARS) });
  }
  return chunks;
}

/** Nome enxuto do artigo (remove o prefixo "Fluig - Plataforma - XXX - "). */
function cleanName(name: string): string {
  return squash(name).replace(/^Fluig\s*-\s*Plataforma\s*-\s*[A-Z]{2,4}\s*-\s*/i, "");
}

export async function ingestCentralHelp(limit?: number): Promise<ParseResult> {
  const warnings: string[] = [];
  const sources: SourceDefinition[] = [];
  const documents: ParsedDocument[] = [];

  const articles = await fetchArticles(limit);
  console.log(`  ${articles.length} artigos públicos do Fluig listados na Central.`);

  for (const a of articles) {
    if (a.draft || !a.body) {
      warnings.push(`Artigo ${a.id} sem corpo ou em rascunho, ignorado.`);
      continue;
    }
    const text = htmlToText(a.body);
    if (!text.trim()) {
      warnings.push(`Artigo ${a.id} ("${a.name}") sem texto após conversão, ignorado.`);
      continue;
    }
    const title = squash(a.title || a.name);
    const chunks = chunkText(title, text);
    if (chunks.length === 0) continue;

    const slug = `${CENTRAL_SOURCE_PREFIX}${a.id}`;
    sources.push({
      slug,
      name: `Central - ${cleanName(a.name)}`.slice(0, 160),
      kind: "docs",
      url: a.html_url,
    });
    documents.push({ sourceSlug: slug, url: a.html_url, title, chunks });
  }

  console.log(`  ${documents.length} artigos convertidos em ${documents.reduce((n, d) => n + d.chunks.length, 0)} trechos.`);
  return { entries: [], warnings, sources, documents };
}
