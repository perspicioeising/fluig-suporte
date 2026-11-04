-- =============================================================================
-- 0004: Dados do workspace - ambientes, coleções, histórico, SOAP, IA, diagnóstico
-- Executar após a 0003. Idempotente.
--
-- Padrão de isolamento: toda tabela tem workspace_id e as FKs entre tabelas são
-- COMPOSTAS (id, workspace_id), impedindo vincular um registro a um recurso de
-- outro workspace.
-- Papéis: owner/admin/member escrevem; viewer apenas lê.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ambientes Fluig
-- encrypted_credentials: cifrado NO SERVIDOR (AES-256-GCM) antes de gravar.
-- O navegador nunca consegue ler essa coluna (ver GRANT por coluna abaixo).
-- -----------------------------------------------------------------------------
create table if not exists public.fluig_environments (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 120),
  base_url              text not null,
  auth_type             text not null default 'none'
                        check (auth_type in ('none', 'basic', 'bearer', 'oauth1', 'header')),
  encrypted_credentials text,
  has_credentials       boolean generated always as (encrypted_credentials is not null) stored,
  is_active             boolean not null default true,
  -- Métodos que alteram dados (POST/PUT/PATCH/DELETE) ficam bloqueados por padrão.
  allow_write_methods   boolean not null default false,
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (workspace_id, name),
  unique (id, workspace_id)
);

drop trigger if exists fluig_environments_set_updated_at on public.fluig_environments;
create trigger fluig_environments_set_updated_at
  before update on public.fluig_environments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Coleções e requisições salvas
-- -----------------------------------------------------------------------------
create table if not exists public.collections (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 120),
  description   text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id)
);

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create table if not exists public.saved_requests (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  collection_id   uuid not null,
  environment_id  uuid,
  name            text not null check (char_length(name) between 1 and 160),
  method          text not null
                  check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
  path            text not null,
  query           jsonb not null default '[]'::jsonb,
  headers         jsonb not null default '[]'::jsonb,
  body_type       text not null default 'none' check (body_type in ('none', 'json', 'xml', 'text')),
  body            text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (collection_id, workspace_id)
    references public.collections (id, workspace_id) on delete cascade,
  foreign key (environment_id, workspace_id)
    references public.fluig_environments (id, workspace_id) on delete set null (environment_id)
);

create index if not exists saved_requests_collection_idx
  on public.saved_requests (collection_id);

drop trigger if exists saved_requests_set_updated_at on public.saved_requests;
create trigger saved_requests_set_updated_at
  before update on public.saved_requests
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Histórico de execuções (append-only para clientes)
-- Headers de autenticação devem ser mascarados pelo servidor antes de gravar.
-- -----------------------------------------------------------------------------
create table if not exists public.request_history (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  environment_id    uuid,
  kind              text not null default 'rest' check (kind in ('rest', 'soap')),
  method            text not null,
  url               text not null,
  request_headers   jsonb not null default '{}'::jsonb,
  request_body      text,
  status_code       integer,
  response_headers  jsonb,
  response_body     text,
  duration_ms       integer,
  error             text,
  created_at        timestamptz not null default now(),
  foreign key (environment_id, workspace_id)
    references public.fluig_environments (id, workspace_id) on delete set null (environment_id)
);

create index if not exists request_history_workspace_created_idx
  on public.request_history (workspace_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Laboratório SOAP
-- -----------------------------------------------------------------------------
create table if not exists public.soap_wsdls (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 160),
  storage_path      text,
  target_namespace  text,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, workspace_id)
);

drop trigger if exists soap_wsdls_set_updated_at on public.soap_wsdls;
create trigger soap_wsdls_set_updated_at
  before update on public.soap_wsdls
  for each row execute function public.set_updated_at();

create table if not exists public.soap_operations (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  wsdl_id         uuid not null,
  service_name    text not null,
  port_name       text,
  operation_name  text not null,
  soap_action     text,
  input_schema    jsonb not null default '[]'::jsonb,
  output_schema   jsonb not null default '[]'::jsonb,
  foreign key (wsdl_id, workspace_id)
    references public.soap_wsdls (id, workspace_id) on delete cascade
);

create index if not exists soap_operations_wsdl_idx
  on public.soap_operations (wsdl_id);

-- -----------------------------------------------------------------------------
-- Diagnósticos e conversas com a IA
-- -----------------------------------------------------------------------------
create table if not exists public.diagnostics (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  category      text,
  input_text    text not null,
  result        jsonb,
  sources       jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists diagnostics_workspace_created_idx
  on public.diagnostics (workspace_id, created_at desc);

create table if not exists public.ai_conversations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  title         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id)
);

drop trigger if exists ai_conversations_set_updated_at on public.ai_conversations;
create trigger ai_conversations_set_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create table if not exists public.ai_messages (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  conversation_id  uuid not null,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  citations        jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  foreign key (conversation_id, workspace_id)
    references public.ai_conversations (id, workspace_id) on delete cascade
);

create index if not exists ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.fluig_environments enable row level security;
alter table public.collections        enable row level security;
alter table public.saved_requests     enable row level security;
alter table public.request_history    enable row level security;
alter table public.soap_wsdls         enable row level security;
alter table public.soap_operations    enable row level security;
alter table public.diagnostics        enable row level security;
alter table public.ai_conversations   enable row level security;
alter table public.ai_messages        enable row level security;

revoke all on
  public.fluig_environments, public.collections, public.saved_requests,
  public.request_history, public.soap_wsdls, public.soap_operations,
  public.diagnostics, public.ai_conversations, public.ai_messages
from anon;

-- ---- fluig_environments: credenciais nunca saem do banco para o navegador ----
revoke select on public.fluig_environments from authenticated;
grant select (
  id, workspace_id, name, base_url, auth_type, has_credentials,
  is_active, allow_write_methods, created_by, created_at, updated_at
) on public.fluig_environments to authenticated;

-- Escrita de credenciais só pelo servidor (service role). Clientes podem
-- alterar apenas campos não sensíveis.
revoke insert, update on public.fluig_environments from authenticated;
grant insert (workspace_id, name, base_url, auth_type, is_active, allow_write_methods, created_by)
  on public.fluig_environments to authenticated;
grant update (name, base_url, auth_type, is_active, allow_write_methods)
  on public.fluig_environments to authenticated;

drop policy if exists "environments_select" on public.fluig_environments;
create policy "environments_select" on public.fluig_environments
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "environments_insert" on public.fluig_environments;
create policy "environments_insert" on public.fluig_environments
  for insert to authenticated
  with check (
    public.has_workspace_role(workspace_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );

drop policy if exists "environments_update" on public.fluig_environments;
create policy "environments_update" on public.fluig_environments
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "environments_delete" on public.fluig_environments;
create policy "environments_delete" on public.fluig_environments
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ---- Tabelas editáveis por owner/admin/member --------------------------------
-- collections
drop policy if exists "collections_select" on public.collections;
create policy "collections_select" on public.collections
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "collections_insert" on public.collections;
create policy "collections_insert" on public.collections
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member'])
              and created_by = (select auth.uid()));
drop policy if exists "collections_update" on public.collections;
create policy "collections_update" on public.collections
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));
drop policy if exists "collections_delete" on public.collections;
create policy "collections_delete" on public.collections
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));

-- saved_requests
drop policy if exists "saved_requests_select" on public.saved_requests;
create policy "saved_requests_select" on public.saved_requests
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "saved_requests_insert" on public.saved_requests;
create policy "saved_requests_insert" on public.saved_requests
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member'])
              and created_by = (select auth.uid()));
drop policy if exists "saved_requests_update" on public.saved_requests;
create policy "saved_requests_update" on public.saved_requests
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));
drop policy if exists "saved_requests_delete" on public.saved_requests;
create policy "saved_requests_delete" on public.saved_requests
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));

-- soap_wsdls
drop policy if exists "soap_wsdls_select" on public.soap_wsdls;
create policy "soap_wsdls_select" on public.soap_wsdls
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "soap_wsdls_insert" on public.soap_wsdls;
create policy "soap_wsdls_insert" on public.soap_wsdls
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member'])
              and created_by = (select auth.uid()));
drop policy if exists "soap_wsdls_update" on public.soap_wsdls;
create policy "soap_wsdls_update" on public.soap_wsdls
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));
drop policy if exists "soap_wsdls_delete" on public.soap_wsdls;
create policy "soap_wsdls_delete" on public.soap_wsdls
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));

-- soap_operations
drop policy if exists "soap_operations_select" on public.soap_operations;
create policy "soap_operations_select" on public.soap_operations
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "soap_operations_insert" on public.soap_operations;
create policy "soap_operations_insert" on public.soap_operations
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));
drop policy if exists "soap_operations_update" on public.soap_operations;
create policy "soap_operations_update" on public.soap_operations
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));
drop policy if exists "soap_operations_delete" on public.soap_operations;
create policy "soap_operations_delete" on public.soap_operations
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));

-- ---- Registros pertencentes ao usuário (histórico, diagnósticos, IA) ----------
-- request_history: append-only (sem update). Remoção só do próprio registro.
drop policy if exists "request_history_select" on public.request_history;
create policy "request_history_select" on public.request_history
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "request_history_insert" on public.request_history;
create policy "request_history_insert" on public.request_history
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member'])
              and user_id = (select auth.uid()));
drop policy if exists "request_history_delete" on public.request_history;
create policy "request_history_delete" on public.request_history
  for delete to authenticated using (user_id = (select auth.uid()));
revoke update on public.request_history from authenticated;

-- diagnostics: append-only
drop policy if exists "diagnostics_select" on public.diagnostics;
create policy "diagnostics_select" on public.diagnostics
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "diagnostics_insert" on public.diagnostics;
create policy "diagnostics_insert" on public.diagnostics
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member'])
              and user_id = (select auth.uid()));
drop policy if exists "diagnostics_delete" on public.diagnostics;
create policy "diagnostics_delete" on public.diagnostics
  for delete to authenticated using (user_id = (select auth.uid()));
revoke update on public.diagnostics from authenticated;

-- ai_conversations: privadas ao usuário dono
drop policy if exists "ai_conversations_select" on public.ai_conversations;
create policy "ai_conversations_select" on public.ai_conversations
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
drop policy if exists "ai_conversations_insert" on public.ai_conversations;
create policy "ai_conversations_insert" on public.ai_conversations
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));
drop policy if exists "ai_conversations_update" on public.ai_conversations;
create policy "ai_conversations_update" on public.ai_conversations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "ai_conversations_delete" on public.ai_conversations;
create policy "ai_conversations_delete" on public.ai_conversations
  for delete to authenticated using (user_id = (select auth.uid()));

-- ai_messages: acesso derivado da conversa (dono da conversa)
drop policy if exists "ai_messages_select" on public.ai_messages;
create policy "ai_messages_select" on public.ai_messages
  for select to authenticated
  using (exists (
    select 1 from public.ai_conversations c
    where c.id = ai_messages.conversation_id
      and c.workspace_id = ai_messages.workspace_id
      and c.user_id = (select auth.uid())
  ));
drop policy if exists "ai_messages_insert" on public.ai_messages;
create policy "ai_messages_insert" on public.ai_messages
  for insert to authenticated
  with check (exists (
    select 1 from public.ai_conversations c
    where c.id = ai_messages.conversation_id
      and c.workspace_id = ai_messages.workspace_id
      and c.user_id = (select auth.uid())
  ));
revoke update, delete on public.ai_messages from authenticated;
