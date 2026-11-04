-- Assunto (Documentos, Usuários, Processos...) das entradas do catálogo, para filtros na tela.
-- É uma classificação de navegação do Studio, calculada pelo código de importação
-- (src/modules/catalog/topics.ts); não vem da documentação oficial. Idempotente.
alter table public.catalog_entries
  add column if not exists topics text[] not null default '{}';

create index if not exists catalog_entries_topics_idx
  on public.catalog_entries using gin (topics);

create index if not exists catalog_entries_http_method_idx
  on public.catalog_entries (http_method);
