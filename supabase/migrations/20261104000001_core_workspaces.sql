-- =============================================================================
-- 0001: Núcleo - extensões, perfis, workspaces, membros e funções auxiliares
-- Executar PRIMEIRO. Pode ser reexecutada com segurança (idempotente).
-- =============================================================================

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Função genérica para manter updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Workspaces e membros (MVP: um membro por workspace, modelo já multi-membro)
-- -----------------------------------------------------------------------------
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

create table if not exists public.workspace_members (
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null default 'member'
                check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id);

-- -----------------------------------------------------------------------------
-- Funções auxiliares usadas pelas policies de RLS
-- SECURITY DEFINER evita recursão de RLS ao consultar workspace_members.
-- -----------------------------------------------------------------------------
create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_workspace_role(ws uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = (select auth.uid())
      and m.role = any (allowed_roles)
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.has_workspace_role(uuid, text[]) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Novo usuário => perfil + workspace pessoal + membership 'owner'
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
  display_name text;
begin
  display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');

  insert into public.profiles (id, full_name, email)
  values (new.id, display_name, new.email)
  on conflict (id) do nothing;

  insert into public.workspaces (name, created_by)
  values (coalesce(display_name, split_part(new.email, '@', 1), 'Meu workspace') || ' - workspace', new.id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Backfill: usuários já cadastrados antes desta migration
-- -----------------------------------------------------------------------------
do $$
declare
  u record;
  ws_id uuid;
  display_name text;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users au
    where not exists (select 1 from public.profiles p where p.id = au.id)
  loop
    display_name := nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '');

    insert into public.profiles (id, full_name, email)
    values (u.id, display_name, u.email);

    insert into public.workspaces (name, created_by)
    values (coalesce(display_name, split_part(u.email, '@', 1), 'Meu workspace') || ' - workspace', u.id)
    returning id into ws_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_id, u.id, 'owner');
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;

revoke all on public.profiles, public.workspaces, public.workspace_members from anon;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member" on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id));

drop policy if exists "workspaces_update_admin" on public.workspaces;
create policy "workspaces_update_admin" on public.workspaces
  for update to authenticated
  using (public.has_workspace_role(id, array['owner', 'admin']))
  with check (public.has_workspace_role(id, array['owner', 'admin']));

drop policy if exists "workspaces_delete_owner" on public.workspaces;
create policy "workspaces_delete_owner" on public.workspaces
  for delete to authenticated
  using (public.has_workspace_role(id, array['owner']));

-- Membros: somente leitura para clientes. Convites/alterações serão feitos
-- via servidor (service role) quando o recurso multi-membro for implementado.
drop policy if exists "members_select_same_workspace" on public.workspace_members;
create policy "members_select_same_workspace" on public.workspace_members
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

revoke insert, update, delete on public.workspace_members from authenticated;
revoke insert on public.workspaces from authenticated;
