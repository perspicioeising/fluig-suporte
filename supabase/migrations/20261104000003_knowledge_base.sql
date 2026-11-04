-- =============================================================================
-- 0003: Base de conhecimento (RAG) com pgvector
-- Executar após a 0002. Idempotente.
-- ATENÇÃO: a dimensão do vetor (1024) corresponde aos modelos padrão da
-- Voyage AI. Se usar outro provedor, ajuste ANTES de executar.
-- =============================================================================

create table if not exists public.kb_documents (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references public.catalog_sources (id) on delete set null,
  url           text not null unique,
  title         text,
  content_hash  text,
  fetched_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists kb_documents_set_updated_at on public.kb_documents;
create trigger kb_documents_set_updated_at
  before update on public.kb_documents
  for each row execute function public.set_updated_at();

create table if not exists public.kb_chunks (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid not null references public.kb_documents (id) on delete cascade,
  catalog_entry_id  uuid references public.catalog_entries (id) on delete set null,
  chunk_index       integer not null,
  content           text not null,
  metadata          jsonb not null default '{}'::jsonb,
  embedding         extensions.vector(1024),
  created_at        timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists kb_chunks_document_idx
  on public.kb_chunks (document_id);

create index if not exists kb_chunks_embedding_idx
  on public.kb_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- -----------------------------------------------------------------------------
-- Busca semântica. SECURITY INVOKER: respeita a RLS de quem chama.
-- Retorna a URL de origem de cada trecho para permitir citação das fontes.
-- -----------------------------------------------------------------------------
create or replace function public.match_kb_chunks(
  query_embedding  extensions.vector(1024),
  match_count      integer default 8,
  min_similarity   double precision default 0.0
)
returns table (
  chunk_id          uuid,
  document_id       uuid,
  catalog_entry_id  uuid,
  content           text,
  metadata          jsonb,
  source_url        text,
  source_title      text,
  similarity        double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    c.id,
    c.document_id,
    c.catalog_entry_id,
    c.content,
    c.metadata,
    d.url,
    d.title,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.kb_chunks c
  join public.kb_documents d on d.id = c.document_id
  where c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function public.match_kb_chunks(extensions.vector, integer, double precision) from public, anon;
grant execute on function public.match_kb_chunks(extensions.vector, integer, double precision) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: leitura para autenticados; escrita só via service role (ingestão)
-- -----------------------------------------------------------------------------
alter table public.kb_documents enable row level security;
alter table public.kb_chunks    enable row level security;

revoke all on public.kb_documents, public.kb_chunks from anon;
revoke insert, update, delete on public.kb_documents, public.kb_chunks from authenticated;

drop policy if exists "kb_documents_read" on public.kb_documents;
create policy "kb_documents_read" on public.kb_documents
  for select to authenticated using (true);

drop policy if exists "kb_chunks_read" on public.kb_chunks;
create policy "kb_chunks_read" on public.kb_chunks
  for select to authenticated using (true);
