-- =============================================================================
-- 0002: Catálogo de APIs Fluig
-- Executar após a 0001. Idempotente.
-- Leitura: qualquer usuário autenticado. Escrita: somente service role
-- (scripts de ingestão do servidor), que ignora RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fontes da documentação
-- -----------------------------------------------------------------------------
create table if not exists public.catalog_sources (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  kind              text not null
                    check (kind in ('rest_new', 'rest_old', 'soap', 'sdk', 'docs')),
  url               text not null unique,
  notes             text,
  last_ingested_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists catalog_sources_set_updated_at on public.catalog_sources;
create trigger catalog_sources_set_updated_at
  before update on public.catalog_sources
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Entradas do catálogo (endpoint REST, operação SOAP ou método de SDK)
-- -----------------------------------------------------------------------------
create table if not exists public.catalog_entries (
  id                   uuid primary key default gen_random_uuid(),
  source_id            uuid not null references public.catalog_sources (id) on delete cascade,
  slug                 text not null,
  kind                 text not null
                       check (kind in ('rest_new', 'rest_old', 'soap', 'sdk')),
  name                 text not null,
  http_method          text
                       check (http_method is null
                              or http_method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
  path                 text,
  summary              text,
  description          text,
  min_version          text,
  max_version          text,
  is_deprecated        boolean not null default false,
  compatibility_notes  text,
  examples             jsonb not null default '[]'::jsonb,
  tags                 text[] not null default '{}',
  -- Toda entrada deve apontar para a origem oficial (rastreabilidade).
  source_url           text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (source_id, slug)
);

drop trigger if exists catalog_entries_set_updated_at on public.catalog_entries;
create trigger catalog_entries_set_updated_at
  before update on public.catalog_entries
  for each row execute function public.set_updated_at();

create index if not exists catalog_entries_kind_idx
  on public.catalog_entries (kind);
create index if not exists catalog_entries_tags_idx
  on public.catalog_entries using gin (tags);
create index if not exists catalog_entries_name_trgm_idx
  on public.catalog_entries using gin (name extensions.gin_trgm_ops);
create index if not exists catalog_entries_path_trgm_idx
  on public.catalog_entries using gin (path extensions.gin_trgm_ops);
create index if not exists catalog_entries_summary_trgm_idx
  on public.catalog_entries using gin (summary extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Parâmetros de entrada e saída
-- -----------------------------------------------------------------------------
create table if not exists public.catalog_parameters (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.catalog_entries (id) on delete cascade,
  direction    text not null check (direction in ('input', 'output')),
  location     text not null
               check (location in ('path', 'query', 'header', 'body', 'soap_part', 'return')),
  name         text not null,
  data_type    text,
  is_required  boolean not null default false,
  description  text,
  example      text,
  position     integer not null default 0
);

create index if not exists catalog_parameters_entry_idx
  on public.catalog_parameters (entry_id, direction, position);

-- -----------------------------------------------------------------------------
-- RLS: somente leitura para usuários autenticados
-- -----------------------------------------------------------------------------
alter table public.catalog_sources    enable row level security;
alter table public.catalog_entries    enable row level security;
alter table public.catalog_parameters enable row level security;

revoke all on public.catalog_sources, public.catalog_entries, public.catalog_parameters from anon;
revoke insert, update, delete on public.catalog_sources, public.catalog_entries, public.catalog_parameters from authenticated;

drop policy if exists "catalog_sources_read" on public.catalog_sources;
create policy "catalog_sources_read" on public.catalog_sources
  for select to authenticated using (true);

drop policy if exists "catalog_entries_read" on public.catalog_entries;
create policy "catalog_entries_read" on public.catalog_entries
  for select to authenticated using (true);

drop policy if exists "catalog_parameters_read" on public.catalog_parameters;
create policy "catalog_parameters_read" on public.catalog_parameters
  for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- Fontes oficiais informadas no escopo do projeto.
-- O conteúdo das entradas só entra via ingestão (fase 4); nada é inventado aqui.
-- -----------------------------------------------------------------------------
insert into public.catalog_sources (slug, name, kind, url) values
  ('tdn-73084007',  'TDN - pageId 73084007',  'docs',     'https://tdn.totvs.com/pages/releaseview.action?pageId=73084007'),
  ('tdn-fluig-api', 'TDN - Fluig API',        'docs',     'https://tdn.totvs.com/display/public/fluig/Fluig+API'),
  ('tdn-198934765', 'TDN - pageId 198934765', 'docs',     'https://tdn.totvs.com/pages/releaseview.action?pageId=198934765'),
  ('api-fluig-latest', 'api.fluig.com (latest)', 'rest_new', 'https://api.fluig.com/latest/index.html'),
  ('api-fluig-old',    'api.fluig.com (old)',    'rest_old', 'https://api.fluig.com/old/')
on conflict (slug) do nothing;
