-- Verifies that Data API privileges match the RLS-backed SaaS access model.

begin;

do $grants$
begin
  if not has_table_privilege('authenticated', 'public.organizations', 'select')
     or not has_table_privilege('authenticated', 'public.stores', 'select')
     or not has_table_privilege('authenticated', 'public.organization_memberships', 'select') then
    raise exception 'authenticated role cannot load tenant context through the Data API';
  end if;

  if has_table_privilege('anon', 'public.organizations', 'select')
     or has_table_privilege('anon', 'public.stores', 'select')
     or has_table_privilege('anon', 'public.organization_memberships', 'select') then
    raise exception 'anonymous role can read private tenant tables';
  end if;

  if not has_table_privilege('anon', 'public.organization_domains', 'select')
     or not has_table_privilege('anon', 'public.plans', 'select')
     or not has_table_privilege('anon', 'public.features', 'select')
     or not has_table_privilege('anon', 'public.plan_features', 'select') then
    raise exception 'anonymous role cannot read the intended public SaaS catalog';
  end if;

  if has_table_privilege('authenticated', 'public.subscriptions', 'insert')
     or has_table_privilege('authenticated', 'public.subscriptions', 'update')
     or has_table_privilege('authenticated', 'public.subscriptions', 'delete') then
    raise exception 'authenticated clients can mutate subscriptions directly';
  end if;
end;
$grants$;

rollback;
