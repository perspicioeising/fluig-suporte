-- =============================================================================
-- 0006: Busca por texto completo na base de conhecimento (RAG sem embeddings)
-- Executar após a 0005. Idempotente.
--
-- A busca vetorial (match_kb_chunks, migration 0003) continua disponível para
-- quando houver um provedor de embeddings. Esta é a busca padrão do assistente.
-- =============================================================================

-- Texto indexado: identificadores camelCase são divididos em palavras
-- ("getAvailableDatasets" -> "get Available Datasets") para casar com perguntas
-- em linguagem natural. regexp_replace e to_tsvector (config explícita) são IMMUTABLE.
alter table public.kb_chunks
  add column if not exists fts tsvector
  generated always as (
    to_tsvector(
      'portuguese'::regconfig,
      regexp_replace(content, '([a-z0-9])([A-Z])', '\1 \2', 'g')
    )
  ) stored;

create index if not exists kb_chunks_fts_idx
  on public.kb_chunks using gin (fts);

-- -----------------------------------------------------------------------------
-- Busca: termos combinados com OR e ordenação por relevância (ts_rank_cd).
-- SECURITY INVOKER: respeita a RLS de quem chama.
-- Retorna a URL de origem de cada trecho para permitir a citação das fontes.
-- -----------------------------------------------------------------------------
create or replace function public.search_kb_chunks(
  query_text   text,
  match_count  integer default 8
)
returns table (
  chunk_id          uuid,
  document_id       uuid,
  catalog_entry_id  uuid,
  content           text,
  metadata          jsonb,
  source_url        text,
  source_title      text,
  rank              real
)
language sql
stable
set search_path = public, extensions
as $$
  with q as (
    select websearch_to_tsquery(
      'portuguese'::regconfig,
      regexp_replace(
        regexp_replace(trim(query_text), '([a-z0-9])([A-Z])', '\1 \2', 'g'),
        '\s+', ' or ', 'g'
      )
    ) as tsq
  )
  select
    c.id,
    c.document_id,
    c.catalog_entry_id,
    c.content,
    c.metadata,
    d.url,
    d.title,
    ts_rank_cd(c.fts, q.tsq) as rank
  from public.kb_chunks c
  join public.kb_documents d on d.id = c.document_id
  cross join q
  where q.tsq::text <> '' and c.fts @@ q.tsq
  order by rank desc
  limit least(greatest(match_count, 1), 30);
$$;

revoke all on function public.search_kb_chunks(text, integer) from public, anon;
grant execute on function public.search_kb_chunks(text, integer) to authenticated;
