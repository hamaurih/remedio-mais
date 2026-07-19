-- Run after create_payment_provider_platform.sql. All data is rolled back.

begin;

do $platform_shape$
begin
  if to_regclass('public.payment_providers') is null
    or to_regclass('public.payment_routes') is null then
    raise exception 'payment provider platform tables are missing';
  end if;

  if (
    select count(*)
    from pg_policy
    where polrelid in (
      'public.payment_providers'::regclass,
      'public.payment_routes'::regclass
    )
  ) < 8 then
    raise exception 'payment provider RLS policies are incomplete';
  end if;

  if not exists (
    select 1
    from public.payment_providers
    where organization_id =
      '00000000-0000-0000-0000-000000000001'::uuid
      and store_id =
        '00000000-0000-0000-0000-000000000002'::uuid
      and provider_key = 'mercado_pago'
  ) then
    raise exception 'Mercado Pago compatibility adapter was not seeded';
  end if;
end;
$platform_shape$;

insert into public.organizations (id, name, slug, status)
values (
  '61000000-0000-0000-0000-000000000001'::uuid,
  'Tenant pagamentos',
  'tenant-payment-provider-test',
  'active'
);

insert into public.stores (
  id, organization_id, name, code, slug, is_headquarters, active
)
values (
  '62000000-0000-0000-0000-000000000001'::uuid,
  '61000000-0000-0000-0000-000000000001'::uuid,
  'Loja pagamentos',
  'PAY-TEST',
  'matriz',
  true,
  true
);

insert into public.payment_providers (
  id,
  organization_id,
  store_id,
  provider_key,
  display_name,
  enabled,
  capabilities,
  credential_secret_name
)
values (
  '63000000-0000-0000-0000-000000000001'::uuid,
  '61000000-0000-0000-0000-000000000001'::uuid,
  '62000000-0000-0000-0000-000000000001'::uuid,
  'bank_api_test',
  'Banco de teste',
  true,
  array['pix', 'open_finance'],
  'BANK_API_TEST_TOKEN'
);

insert into public.payment_routes (
  organization_id,
  store_id,
  provider_id,
  payment_method,
  priority
)
values (
  '61000000-0000-0000-0000-000000000001'::uuid,
  '62000000-0000-0000-0000-000000000001'::uuid,
  '63000000-0000-0000-0000-000000000001'::uuid,
  'open_finance',
  10
);

do $cross_tenant_provider$
begin
  begin
    insert into public.payment_routes (
      organization_id,
      store_id,
      provider_id,
      payment_method,
      priority
    )
    values (
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      '63000000-0000-0000-0000-000000000001'::uuid,
      'open_finance',
      10
    );

    raise exception 'cross-tenant payment provider was accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$cross_tenant_provider$;

rollback;
