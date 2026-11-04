import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { classifyTopics } from "../../../src/modules/catalog/topics";
import { entryToChunk, sha256 } from "./chunk";
import type { NormalizedEntry, ParsedDocument, SourceDefinition } from "./types";

/**
 * Escrita no catálogo usa a service role (ignora RLS) e roda SOMENTE em
 * scripts de servidor. A chave nunca é impressa.
 */
export function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

export type PersistStats = {
  entries: number;
  parameters: number;
  removedEntries: number;
  documents: number;
  chunks: number;
};

/** Cria ou atualiza uma fonte de documentação (chave: slug). */
export async function ensureSource(db: SupabaseClient, source: SourceDefinition) {
  const { error } = await db
    .from("catalog_sources")
    .upsert(source, { onConflict: "slug" });
  if (error) fail(`Falha ao gravar a fonte "${source.slug}"`, error);
}

async function sourceIdOf(db: SupabaseClient, slug: string): Promise<string> {
  const { data, error } = await db
    .from("catalog_sources")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail("Falha ao consultar catalog_sources (as migrations foram executadas?)", error);
  if (!data) throw new Error(`Fonte "${slug}" não existe em catalog_sources.`);
  return data.id as string;
}

/** Grava documentos conceituais (somente texto) na base de conhecimento. */
export async function persistDocuments(
  db: SupabaseClient,
  documents: ParsedDocument[],
): Promise<{ documents: number; chunks: number }> {
  let chunkCount = 0;

  for (const doc of documents) {
    const sourceId = await sourceIdOf(db, doc.sourceSlug);
    const { data, error } = await db
      .from("kb_documents")
      .upsert(
        {
          source_id: sourceId,
          url: doc.url,
          title: doc.title,
          content_hash: sha256(doc.chunks.map((c) => c.content).join("\n---\n")),
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "url" },
      )
      .select("id")
      .single();
    if (error) fail(`Falha ao gravar kb_documents (${doc.url})`, error);
    const documentId = data.id as string;

    const { error: delError } = await db.from("kb_chunks").delete().eq("document_id", documentId);
    if (delError) fail("Falha ao limpar kb_chunks", delError);

    const rows = doc.chunks.map((chunk, chunk_index) => ({
      document_id: documentId,
      chunk_index,
      content: chunk.content,
      metadata: { heading_path: chunk.headingPath },
    }));
    for (const batch of batches(rows, 100)) {
      const { error: insError } = await db.from("kb_chunks").insert(batch);
      if (insError) fail("Falha ao gravar kb_chunks", insError);
      chunkCount += batch.length;
    }
  }

  return { documents: documents.length, chunks: chunkCount };
}

/** A coluna `topics` vem da migration 0007; sem ela a importação segue normalmente. */
export async function hasTopicsColumn(db: SupabaseClient): Promise<boolean> {
  const { error } = await db.from("catalog_entries").select("topics").limit(1);
  return !error;
}

/** Recalcula `topics` de todas as entradas já gravadas (backfill / após mudar as regras). */
export async function backfillTopics(db: SupabaseClient): Promise<number> {
  if (!(await hasTopicsColumn(db))) {
    throw new Error("A coluna catalog_entries.topics não existe: aplique a migration 20261104000007 primeiro.");
  }
  let updated = 0;
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("catalog_entries")
      .select("id, name, kind, path, tags")
      .order("id")
      .range(from, from + 499);
    if (error) fail("Falha ao ler catalog_entries", error);
    if (!data?.length) break;
    for (const row of data) {
      const topics = classifyTopics(row as { name: string; kind: string; path: string | null; tags: string[] });
      const { error: upError } = await db.from("catalog_entries").update({ topics }).eq("id", row.id);
      if (upError) fail("Falha ao gravar topics", upError);
      updated++;
    }
    if (data.length < 500) break;
  }
  return updated;
}

/**
 * Grava (upsert) as entradas de uma fonte e reconstrói parâmetros e chunks.
 * `preserveDocumentUrls`: documentos da mesma fonte que NÃO devem ser removidos
 * como obsoletos (ex.: páginas conceituais gravadas por persistDocuments).
 */
export async function persistSource(
  db: SupabaseClient,
  sourceSlug: string,
  entries: NormalizedEntry[],
  preserveDocumentUrls: string[] = [],
): Promise<PersistStats> {
  const { data: source, error: sourceError } = await db
    .from("catalog_sources")
    .select("id")
    .eq("slug", sourceSlug)
    .maybeSingle();
  if (sourceError) fail("Falha ao consultar catalog_sources (as migrations foram executadas?)", sourceError);
  if (!source) throw new Error(`Fonte "${sourceSlug}" não existe em catalog_sources.`);
  const sourceId = source.id as string;

  /* 1. Entradas ----------------------------------------------------------- */
  const withTopics = await hasTopicsColumn(db);
  const idBySlug = new Map<string, string>();
  for (const batch of batches(entries, 200)) {
    const rows = batch.map((e) => ({
      source_id: sourceId,
      slug: e.slug,
      kind: e.kind,
      name: e.name,
      http_method: e.http_method,
      path: e.path,
      summary: e.summary,
      description: e.description,
      is_deprecated: e.is_deprecated,
      compatibility_notes: e.compatibility_notes ?? null,
      tags: e.tags,
      examples: e.examples,
      source_url: e.source_url,
      ...(withTopics ? { topics: classifyTopics(e) } : {}),
    }));
    const { data, error } = await db
      .from("catalog_entries")
      .upsert(rows, { onConflict: "source_id,slug" })
      .select("id, slug");
    if (error) fail("Falha ao gravar catalog_entries", error);
    for (const row of data ?? []) idBySlug.set(row.slug as string, row.id as string);
  }

  /* 2. Parâmetros (recriados) -------------------------------------------- */
  const entryIds = [...idBySlug.values()];
  for (const batch of batches(entryIds, 50)) {
    const { error } = await db.from("catalog_parameters").delete().in("entry_id", batch);
    if (error) fail("Falha ao limpar catalog_parameters", error);
  }

  const paramRows = entries.flatMap((e) =>
    e.parameters.map((p, position) => ({
      entry_id: idBySlug.get(e.slug),
      direction: p.direction,
      location: p.location,
      name: p.name,
      data_type: p.data_type,
      is_required: p.is_required,
      description: p.description,
      example: p.example,
      position,
    })),
  );
  for (const batch of batches(paramRows, 500)) {
    const { error } = await db.from("catalog_parameters").insert(batch);
    if (error) fail("Falha ao gravar catalog_parameters", error);
  }

  /* 3. Entradas que saíram da documentação -------------------------------- */
  const { data: existing, error: existingError } = await db
    .from("catalog_entries")
    .select("id, slug")
    .eq("source_id", sourceId)
    .limit(20_000);
  if (existingError) fail("Falha ao listar entradas existentes", existingError);

  const staleIds = (existing ?? [])
    .filter((row) => !idBySlug.has(row.slug as string))
    .map((row) => row.id as string);
  for (const batch of batches(staleIds, 50)) {
    const { error } = await db.from("catalog_entries").delete().in("id", batch);
    if (error) fail("Falha ao remover entradas obsoletas", error);
  }

  /* 4. Base de conhecimento (texto; embeddings são gerados depois) --------- */
  const byDocument = new Map<string, NormalizedEntry[]>();
  for (const e of entries) {
    const list = byDocument.get(e.document_url) ?? [];
    list.push(e);
    byDocument.set(e.document_url, list);
  }

  let chunkCount = 0;
  for (const batch of batches([...byDocument.entries()], 25)) {
    const docRows = batch.map(([url, list]) => ({
      source_id: sourceId,
      url,
      title: list[0].document_title,
      content_hash: sha256(list.map(entryToChunk).join("\n---\n")),
      fetched_at: new Date().toISOString(),
    }));
    const { data: docs, error: docError } = await db
      .from("kb_documents")
      .upsert(docRows, { onConflict: "url" })
      .select("id, url");
    if (docError) fail("Falha ao gravar kb_documents", docError);

    const docIdByUrl = new Map((docs ?? []).map((d) => [d.url as string, d.id as string]));

    const docIds = [...docIdByUrl.values()];
    const { error: delError } = await db.from("kb_chunks").delete().in("document_id", docIds);
    if (delError) fail("Falha ao limpar kb_chunks", delError);

    const chunkRows = batch.flatMap(([url, list]) =>
      list.map((e, chunk_index) => ({
        document_id: docIdByUrl.get(url),
        catalog_entry_id: idBySlug.get(e.slug),
        chunk_index,
        content: entryToChunk(e),
        metadata: { slug: e.slug, kind: e.kind, method: e.http_method, path: e.path },
      })),
    );
    for (const rows of batches(chunkRows, 200)) {
      const { error } = await db.from("kb_chunks").insert(rows);
      if (error) fail("Falha ao gravar kb_chunks", error);
      chunkCount += rows.length;
    }
  }

  // Documentos que não existem mais na fonte
  const { data: oldDocs, error: oldDocsError } = await db
    .from("kb_documents")
    .select("id, url")
    .eq("source_id", sourceId)
    .limit(20_000);
  if (oldDocsError) fail("Falha ao listar kb_documents", oldDocsError);
  const staleDocs = (oldDocs ?? [])
    .filter(
      (d) =>
        !byDocument.has(d.url as string) &&
        !preserveDocumentUrls.includes(d.url as string),
    )
    .map((d) => d.id as string);
  for (const batch of batches(staleDocs, 50)) {
    const { error } = await db.from("kb_documents").delete().in("id", batch);
    if (error) fail("Falha ao remover kb_documents obsoletos", error);
  }

  const { error: touchError } = await db
    .from("catalog_sources")
    .update({ last_ingested_at: new Date().toISOString() })
    .eq("id", sourceId);
  if (touchError) fail("Falha ao atualizar last_ingested_at", touchError);

  return {
    entries: entries.length,
    parameters: paramRows.length,
    removedEntries: staleIds.length,
    documents: byDocument.size,
    chunks: chunkCount,
  };
}
