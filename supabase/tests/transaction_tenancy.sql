-- Run after tenantize_transactions.sql. All data is rolled back.

begin;

do $transaction_shape$
declare
  transaction_table text;
  column_count integer;
  policy_count integer;
begin
  foreach transaction_table in array array[
    'orders',
    'order_items',
    'order_events',
    'prescriptions',
    'payment_errors',
    'payment_events',
    'refund_requests',
    'refund_items',
    'admin_notifications'
  ]
  loop
    select count(*)
    into column_count
    from information_schema.columns transaction_column
    where transaction_column.table_schema = 'public'
      and transaction_column.table_name = transaction_table
      and transaction_column.column_name in ('organization_id', 'store_id')
      and transaction_column.is_nullable = 'NO';

    if column_count <> 2 then
      raise exception 'transaction ownership columns are incomplete on %',
        transaction_table;
    end if;

    select count(*)
    into policy_count
    from pg_policy
    where polrelid = format('public.%I', transaction_table)::regclass
      and polname like transaction_table || '_tenant_%'
      and not polpermissive;

    if policy_count < 3 then
      raise exception 'restrictive tenant policies are incomplete on %',
        transaction_table;
    end if;
  end loop;

  if to_regprocedure('private.is_active_store(uuid,uuid)') is null then
    raise exception 'active-store authorization helper is missing';
  end if;

  if not has_function_privilege(
    'authenticated',
    'private.is_active_store(uuid,uuid)'::regprocedure,
    'execute'
  ) then
    raise exception 'authenticated users cannot validate an active store';
  end if;
end;
$transaction_shape$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  (
    '40000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated', 'transaction-member@example.invalid', '',
    now(), now(), now()
  ),
  (
    '40000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated', 'transaction-customer@example.invalid', '',
    now(), now(), now()
  );

insert into public.organizations (id, name, slug, status)
values (
  '41000000-0000-0000-0000-000000000001'::uuid,
  'Tenant transacional',
  'tenant-transaction-test',
  'active'
);

insert into public.stores (
  id, organization_id, name, code, slug, is_headquarters, active
)
values (
  '42000000-0000-0000-0000-000000000001'::uuid,
  '41000000-0000-0000-0000-000000000001'::uuid,
  'Loja transacional',
  'TX-TEST',
  'matriz',
  true,
  true
);

insert into public.organization_memberships (
  organization_id, user_id, role, status, default_store_id
)
values (
  '41000000-0000-0000-0000-000000000001'::uuid,
  '40000000-0000-0000-0000-000000000001'::uuid,
  'admin',
  'active',
  '42000000-0000-0000-0000-000000000001'::uuid
);

insert into public.payment_settings (organization_id, store_id)
values (
  '41000000-0000-0000-0000-000000000001'::uuid,
  '42000000-0000-0000-0000-000000000001'::uuid
);

do $payment_settings_shape$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payment_settings'::regclass
      and conname = 'payment_settings_singleton'
  ) then
    raise exception 'payment_settings is still a global singleton';
  end if;

  if not exists (
    select 1
    from public.payment_settings
    where organization_id = '41000000-0000-0000-0000-000000000001'::uuid
      and store_id = '42000000-0000-0000-0000-000000000001'::uuid
  ) then
    raise exception 'tenant payment settings could not be created';
  end if;
end;
$payment_settings_shape$;

insert into public.orders (
  id, user_id, customer_name, customer_phone, payment_status
)
values (
  '43000000-0000-0000-0000-000000000001'::uuid,
  '40000000-0000-0000-0000-000000000002'::uuid,
  'Cliente zero',
  '85999999999',
  'pending'
);

insert into public.orders (
  id, organization_id, store_id, user_id,
  customer_name, customer_phone, payment_status
)
values (
  '43000000-0000-0000-0000-000000000002'::uuid,
  '41000000-0000-0000-0000-000000000001'::uuid,
  '42000000-0000-0000-0000-000000000001'::uuid,
  '40000000-0000-0000-0000-000000000001'::uuid,
  'Cliente tenant',
  '85999999998',
  'pending'
);

do $legacy_defaults$
begin
  if not exists (
    select 1
    from public.orders
    where id = '43000000-0000-0000-0000-000000000001'::uuid
      and organization_id = '00000000-0000-0000-0000-000000000001'::uuid
      and store_id = '00000000-0000-0000-0000-000000000002'::uuid
  ) then
    raise exception 'legacy client-zero transaction defaults are missing';
  end if;
end;
$legacy_defaults$;

do $cross_tenant_fk$
begin
  begin
    insert into public.order_items (
      id, organization_id, store_id, order_id,
      product_name, quantity, unit_price
    )
    values (
      '44000000-0000-0000-0000-000000000001'::uuid,
      '41000000-0000-0000-0000-000000000001'::uuid,
      '42000000-0000-0000-0000-000000000001'::uuid,
      '43000000-0000-0000-0000-000000000001'::uuid,
      'Item inválido',
      1,
      1
    );

    raise exception 'cross-tenant order item was accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$cross_tenant_fk$;

-- The validation database has no Lovable legacy policies, so add a minimal
-- permissive policy to exercise the restrictive policy behavior.
create policy transaction_test_orders_select
on public.orders
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_organization_member(organization_id)
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-0000-0000-000000000001',
  true
);

do $member_visibility$
declare
  visible_count integer;
begin
  select count(*)
  into visible_count
  from public.orders
  where id in (
    '43000000-0000-0000-0000-000000000001'::uuid,
    '43000000-0000-0000-0000-000000000002'::uuid
  );

  if visible_count <> 1 then
    raise exception 'organization member saw % transaction tenants, expected 1',
      visible_count;
  end if;
end;
$member_visibility$;

rollback;
