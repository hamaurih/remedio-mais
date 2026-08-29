create schema if not exists app_security;
revoke all on schema app_security from public, anon;
grant usage on schema app_security to authenticated, service_role;

create or replace function app_security.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

revoke all on function app_security.has_role(uuid, public.app_role) from public, anon;
grant execute on function app_security.has_role(uuid, public.app_role) to authenticated, service_role;

do $$
declare r record; q text; new_qual text; new_check text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname='public'
      and (coalesce(qual,'') ~ '(^|[^a-zA-Z0-9_.])has_role\('
           or coalesce(with_check,'') ~ '(^|[^a-zA-Z0-9_.])has_role\('
           or coalesce(qual,'') like '%public.has_role(%'
           or coalesce(with_check,'') like '%public.has_role(%')
  loop
    new_qual := case when r.qual is null then null else replace(replace(r.qual, 'public.has_role(', 'app_security.has_role('), 'has_role(', 'app_security.has_role(') end;
    new_check := case when r.with_check is null then null else replace(replace(r.with_check, 'public.has_role(', 'app_security.has_role('), 'has_role(', 'app_security.has_role(') end;
    q := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if new_qual is not null then q := q || ' using (' || new_qual || ')'; end if;
    if new_check is not null then q := q || ' with check (' || new_check || ')'; end if;
    execute q;
  end loop;
end $$;

revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to service_role;

comment on function app_security.has_role(uuid, public.app_role) is 'Internal RLS authorization helper; schema is not exposed through the public REST API.';
