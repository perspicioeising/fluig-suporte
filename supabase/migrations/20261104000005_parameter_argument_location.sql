-- =============================================================================
-- 0005: Permite o local 'argument' em catalog_parameters
-- (argumentos de métodos SOAP e do SDK, que não são path/query/header/body).
-- Executar ANTES de importar SOAP e SDK. Idempotente.
-- =============================================================================

do $$
declare
  c record;
begin
  -- Remove a CHECK existente sobre "location", seja qual for o nome gerado.
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.catalog_parameters'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%location%'
  loop
    execute format('alter table public.catalog_parameters drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.catalog_parameters
  add constraint catalog_parameters_location_check
  check (location in ('path', 'query', 'header', 'body', 'argument', 'soap_part', 'return'));

-- Compatibilidade: a coluna já existe em catalog_entries (compatibility_notes);
-- nada mais a alterar.
