-- Run after tenantize_trier_settings.sql. All data is rolled back.

begin;

do $trier_settings_shape$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.trier_settings'::regclass
      and conname = 'trier_settings_id_check'
  ) then
    raise exception 'trier_settings is still a global singleton';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'trier_settings'
      and indexname = 'trier_settings_tenant_uidx'
  ) then
    raise exception 'tenant uniqueness is missing from trier_settings';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'trier_settings'
      and column_name in ('organization_id', 'store_id')
      and is_nullable = 'NO'
  ) <> 2 then
    raise exception 'trier_settings tenant ownership is nullable';
  end if;
end;
$trier_settings_shape$;

insert into public.organizations (id, name, slug, status)
values (
  '51000000-0000-0000-0000-000000000001'::uuid,
  'Tenant Trier',
  'tenant-trier-test',
  'active'
);

insert into public.stores (
  id, organization_id, name, code, slug, is_headquarters, active
)
values (
  '52000000-0000-0000-0000-000000000001'::uuid,
  '51000000-0000-0000-0000-000000000001'::uuid,
  'Loja Trier',
  'TRIER-TEST',
  'matriz',
  true,
  true
);

insert into public.trier_settings (organization_id, store_id)
values (
  '51000000-0000-0000-0000-000000000001'::uuid,
  '52000000-0000-0000-0000-000000000001'::uuid
);

do $trier_settings_insert$
begin
  if not exists (
    select 1
    from public.trier_settings
    where organization_id = '51000000-0000-0000-0000-000000000001'::uuid
      and store_id = '52000000-0000-0000-0000-000000000001'::uuid
      and id <> 1
  ) then
    raise exception 'a second tenant Trier configuration could not be created';
  end if;
end;
$trier_settings_insert$;

rollback;
