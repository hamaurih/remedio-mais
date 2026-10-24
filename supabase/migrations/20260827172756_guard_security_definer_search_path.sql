create or replace function private.guard_security_definer_search_path()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  cmd record;
  fn_oid oid;
  is_definer boolean;
  fn_config text[];
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE FUNCTION', 'ALTER FUNCTION')
      and object_type = 'function'
      and schema_name in ('public', 'private')
  loop
    fn_oid := cmd.objid;

    select p.prosecdef, p.proconfig
      into is_definer, fn_config
    from pg_catalog.pg_proc p
    where p.oid = fn_oid;

    if coalesce(is_definer, false)
       and not exists (
         select 1
         from unnest(coalesce(fn_config, array[]::text[])) as setting
         where setting like 'search_path=%'
       )
    then
      raise exception using
        errcode = '42501',
        message = format(
          'SECURITY DEFINER function %s must explicitly SET search_path',
          cmd.object_identity
        ),
        hint = 'Use SET search_path = '''' (preferred with fully-qualified object names) or an explicitly trusted schema list.';
    end if;
  end loop;
end;
$$;

revoke all on function private.guard_security_definer_search_path() from public, anon, authenticated;

drop event trigger if exists enforce_security_definer_search_path;
create event trigger enforce_security_definer_search_path
on ddl_command_end
when tag in ('CREATE FUNCTION', 'ALTER FUNCTION')
execute function private.guard_security_definer_search_path();
