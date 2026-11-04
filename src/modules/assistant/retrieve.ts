import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Source } from "./types";

export type RetrievedSource = Source & { content: string };

const MAX_SOURCES = 8;
const MAX_BOOSTED = 4;
const MAX_CONTENT_CHARS = 1800;

/** Identificadores citados na pergunta: getFooBar, ECMFooService, Service.metodo. */
const IDENTIFIER =
  /\b(?:[a-z]+(?:[A-Z][a-z0-9]*)+|[A-Z][A-Za-z0-9]*(?:Service|Dto)|[A-Za-z]+\.[a-z][A-Za-z0-9]+)\b/g;

type Row = {
  id: string;
  content: string;
  metadata: Record<string, unknown> | null;
  catalog_entry_id: string | null;
  url: string;
  title: string | null;
};

function sourceFrom(row: Row, index: number): RetrievedSource {
  const meta = row.metadata ?? {};
  const kind = typeof meta.kind === "string" ? meta.kind : "docs";
  const headings = Array.isArray(meta.heading_path) ? (meta.heading_path as string[]) : [];

  // Para entradas do catálogo a 1ª linha é "MÉTODO caminho" ou o nome; para texto conceitual, o título + seção.
  const firstLine = row.content.split("\n", 1)[0]?.trim() ?? "";
  const title = row.catalog_entry_id
    ? firstLine || (row.title ?? "Catálogo")
    : [row.title, headings.at(-1)].filter(Boolean).join(" › ") || "Documentação";

  const content = row.content.slice(0, MAX_CONTENT_CHARS);
  return {
    index,
    title: title.slice(0, 160),
    url: row.url,
    kind,
    entryId: row.catalog_entry_id,
    snippet: content.replace(/\s+/g, " ").slice(0, 220),
    content,
  };
}

/**
 * Recupera os trechos mais relevantes da documentação oficial.
 *  1. Busca por texto completo (Postgres) com a pergunta.
 *  2. Reforço por identificadores citados (nome exato de método/serviço no catálogo).
 */
export async function retrieveSources(
  supabase: SupabaseClient,
  question: string,
  previousQuestion?: string,
): Promise<RetrievedSource[]> {
  // Perguntas curtas costumam ser continuações ("e o retorno?"): inclui a anterior.
  const query = question.length < 60 && previousQuestion ? `${previousQuestion} ${question}` : question;

  const rows = new Map<string, Row>();
  const boostedIds: string[] = [];

  // 2. Identificadores -> entradas do catálogo -> seus trechos
  const identifiers = [...new Set(query.match(IDENTIFIER) ?? [])].slice(0, 5);
  if (identifiers.length > 0) {
    const filters = identifiers
      .map((id) => id.replace(/[^A-Za-z0-9.]/g, ""))
      .filter(Boolean)
      .map((id) => `name.ilike.%${id}%`)
      .join(",");

    if (filters) {
      const { data: entries } = await supabase
        .from("catalog_entries")
        .select("id")
        .or(filters)
        .limit(MAX_BOOSTED + 4);

      const ids = (entries ?? []).map((e) => e.id as string);
      if (ids.length > 0) {
        const { data } = await supabase
          .from("kb_chunks")
          .select("id, content, metadata, catalog_entry_id, kb_documents(url, title)")
          .in("catalog_entry_id", ids)
          .limit(MAX_BOOSTED);

        for (const r of (data ?? []) as unknown as (Omit<Row, "url" | "title"> & {
          kb_documents: { url: string; title: string | null } | null;
        })[]) {
          if (!r.kb_documents) continue;
          rows.set(r.id, { ...r, url: r.kb_documents.url, title: r.kb_documents.title });
          boostedIds.push(r.id);
        }
      }
    }
  }

  // 1. Texto completo
  const { data: found, error } = await supabase.rpc("search_kb_chunks", {
    query_text: query,
    match_count: MAX_SOURCES,
  });
  if (error) {
    if (error.code === "PGRST202" || /search_kb_chunks/.test(error.message)) {
      throw new Error("A busca na base de conhecimento ainda não foi instalada (execute a migration 0006).");
    }
    throw new Error("Falha ao consultar a base de conhecimento.");
  }

  for (const r of (found ?? []) as {
    chunk_id: string;
    content: string;
    metadata: Record<string, unknown> | null;
    catalog_entry_id: string | null;
    source_url: string;
    source_title: string | null;
  }[]) {
    if (rows.has(r.chunk_id)) continue;
    rows.set(r.chunk_id, {
      id: r.chunk_id,
      content: r.content,
      metadata: r.metadata,
      catalog_entry_id: r.catalog_entry_id,
      url: r.source_url,
      title: r.source_title,
    });
  }

  // Reforçados primeiro, depois por relevância (ordem de inserção do RPC)
  const ordered = [
    ...boostedIds.map((id) => rows.get(id)!),
    ...[...rows.values()].filter((r) => !boostedIds.includes(r.id)),
  ].slice(0, MAX_SOURCES);

  return ordered.map((row, i) => sourceFrom(row, i + 1));
}
