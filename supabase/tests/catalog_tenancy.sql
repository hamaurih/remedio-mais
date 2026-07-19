-- Run after tenantize_public_catalog.sql. All test data is rolled back.

begin;

do $catalog_shape$
declare
  catalog_table text;
  missing_count integer;
begin
  foreach catalog_table in array array[
    'departments',
    'categories',
    'subcategories',
    'products',
    'product_variants',
    'product_related',
    'product_taxonomy',
    'stock_movements',
    'banners',
    'campaigns',
    'campaign_products',
    'home_layout',
    'home_mosaic_tiles',
    'menu_items',
    'promo_banner_blocks'
  ]
  loop
    select count(*)
    into missing_count
    from information_schema.columns catalog_column
    where catalog_column.table_schema = 'public'
      and catalog_column.table_name = catalog_table
      and catalog_column.column_name in ('organization_id', 'store_id')
      and catalog_column.is_nullable = 'NO';

    if missing_count <> 2 then
      raise exception 'tenant ownership columns are missing or nullable on %', catalog_table;
    end if;

    select count(*)
    into missing_count
    from pg_policy
    where polrelid = format('public.%I', catalog_table)::regclass
      and polname in (
        catalog_table || '_tenant_insert',
        catalog_table || '_tenant_update',
        catalog_table || '_tenant_delete'
      )
      and not polpermissive;

    if missing_count <> 3 then
      raise exception 'restrictive tenant write policies are incomplete on %', catalog_table;
    end if;
  end loop;
end;
$catalog_shape$;

insert into public.organizations (id, name, slug, status)
values (
  '30000000-0000-0000-0000-000000000001'::uuid,
  'Tenant de teste',
  'tenant-catalog-test',
  'active'
);

insert into public.stores (
  id, organization_id, name, code, slug, is_headquarters, active
)
values (
  '30000000-0000-0000-0000-000000000002'::uuid,
  '30000000-0000-0000-0000-000000000001'::uuid,
  'Loja de teste',
  'TEST',
  'matriz',
  true,
  true
);

insert into public.store_settings (organization_id, store_id)
values (
  '30000000-0000-0000-0000-000000000001'::uuid,
  '30000000-0000-0000-0000-000000000002'::uuid
);

do $settings_shape$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.store_settings'::regclass
      and conname = 'single_row'
  ) then
    raise exception 'store_settings is still restricted to the legacy singleton row';
  end if;

  if not exists (
    select 1
    from public.store_settings_public
    where organization_id = '30000000-0000-0000-0000-000000000001'::uuid
      and store_id = '30000000-0000-0000-0000-000000000002'::uuid
  ) then
    raise exception 'tenant-scoped settings are not exposed by the public view';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.store_settings_public'::regclass
      and coalesce(reloptions, '{}'::text[]) @> array['security_invoker=true']
  ) then
    raise exception 'store_settings_public is not a security-invoker view';
  end if;
end;
$settings_shape$;

insert into public.departments (
  id, organization_id, store_id, name, slug
)
values
  (
    '31000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid,
    'Departamento cliente zero',
    'slug-compartilhado'
  ),
  (
    '31000000-0000-0000-0000-000000000002'::uuid,
    '30000000-0000-0000-0000-000000000001'::uuid,
    '30000000-0000-0000-0000-000000000002'::uuid,
    'Departamento tenant teste',
    'slug-compartilhado'
  );

insert into public.departments (id, name, slug)
values (
  '31000000-0000-0000-0000-000000000003'::uuid,
  'Departamento legado',
  'departamento-legado'
);

do $legacy_defaults$
begin
  if not exists (
    select 1
    from public.departments
    where id = '31000000-0000-0000-0000-000000000003'::uuid
      and organization_id = '00000000-0000-0000-0000-000000000001'::uuid
      and store_id = '00000000-0000-0000-0000-000000000002'::uuid
  ) then
    raise exception 'legacy client-zero catalog writes lost their tenant defaults';
  end if;
end;
$legacy_defaults$;

insert into public.categories (
  id, organization_id, store_id, department_id, name, slug
)
values (
  '32000000-0000-0000-0000-000000000001'::uuid,
  '30000000-0000-0000-0000-000000000001'::uuid,
  '30000000-0000-0000-0000-000000000002'::uuid,
  '31000000-0000-0000-0000-000000000002'::uuid,
  'Categoria válida',
  'categoria-valida'
);

do $cross_tenant_fk$
begin
  begin
    insert into public.categories (
      id, organization_id, store_id, department_id, name, slug
    )
    values (
      '32000000-0000-0000-0000-000000000002'::uuid,
      '30000000-0000-0000-0000-000000000001'::uuid,
      '30000000-0000-0000-0000-000000000002'::uuid,
      '31000000-0000-0000-0000-000000000001'::uuid,
      'Categoria inválida',
      'categoria-invalida'
    );

    raise exception 'cross-tenant catalog relationship was accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$cross_tenant_fk$;

rollback;
