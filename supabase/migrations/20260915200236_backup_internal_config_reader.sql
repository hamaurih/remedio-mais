
create or replace function public.backup_internal_config_value(_key text)
returns text
language sql
security definer
set search_path = pg_catalog, backup_internal
as $$
  select value from backup_internal.config where key=_key;
$$;
revoke all on function public.backup_internal_config_value(text) from public, anon, authenticated;
grant execute on function public.backup_internal_config_value(text) to service_role;
