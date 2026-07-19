-- Tenant ownership and RLS hardening for PII-bearing transactional records.
-- Service-role Edge Functions bypass RLS, but must still satisfy the composite
-- tenant foreign keys added below.

begin;

create or replace function private.is_active_store(
  target_organization_id uuid,
  target_store_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stores store
    join public.organizations organization
      on organization.id = store.organization_id
    where store.organization_id = target_organization_id
      and store.id = target_store_id
      and store.active
      and organization.status in ('trial', 'active')
  );
$$;

revoke all on function private.is_active_store(uuid, uuid) from public;
grant execute on function private.is_active_store(uuid, uuid) to anon, authenticated;

do $transaction_tables$
declare
  transaction_table text;
  constraint_name text;
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
    if to_regclass(format('public.%I', transaction_table)) is null then
      raise exception 'required transaction table public.% is missing', transaction_table;
    end if;

    execute format(
      'alter table public.%I
         add column if not exists organization_id uuid,
         add column if not exists store_id uuid',
      transaction_table
    );

    execute format(
      'update public.%I
          set organization_id = coalesce(organization_id, %L::uuid),
              store_id = coalesce(store_id, %L::uuid)
        where organization_id is null or store_id is null',
      transaction_table,
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002'
    );

    execute format(
      'alter table public.%I
         alter column organization_id set not null,
         alter column store_id set not null,
         alter column organization_id set default %L::uuid,
         alter column store_id set default %L::uuid',
      transaction_table,
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002'
    );

    constraint_name := transaction_table || '_store_same_org_fk';
    if not exists (
      select 1 from pg_constraint
      where conname = constraint_name
        and conrelid = format('public.%I', transaction_table)::regclass
    ) then
      execute format(
        'alter table public.%I
           add constraint %I
           foreign key (organization_id, store_id)
           references public.stores (organization_id, id)
           on delete restrict',
        transaction_table,
        constraint_name
      );
    end if;

    constraint_name := transaction_table || '_tenant_identity_key';
    if not exists (
      select 1 from pg_constraint
      where conname = constraint_name
        and conrelid = format('public.%I', transaction_table)::regclass
    ) then
      execute format(
        'alter table public.%I
           add constraint %I unique (organization_id, store_id, id)',
        transaction_table,
        constraint_name
      );
    end if;

    execute format(
      'drop policy if exists %I on public.%I',
      transaction_table || '_tenant_update',
      transaction_table
    );
    execute format(
      'create policy %I on public.%I as restrictive
         for update to authenticated
         using (private.is_organization_member(organization_id))
         with check (private.is_organization_member(organization_id))',
      transaction_table || '_tenant_update',
      transaction_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      transaction_table || '_tenant_delete',
      transaction_table
    );
    execute format(
      'create policy %I on public.%I as restrictive
         for delete to authenticated
         using (private.is_organization_member(organization_id))',
      transaction_table || '_tenant_delete',
      transaction_table
    );
  end loop;
end;
$transaction_tables$;

-- Owners may still delete their own prescription; operators must belong to its
-- organization. Other write policies remain combined with the legacy
-- role/ownership policies through restrictive RLS semantics.
drop policy if exists prescriptions_tenant_delete on public.prescriptions;
create policy prescriptions_tenant_delete
on public.prescriptions
as restrictive
for delete
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_organization_member(organization_id)
);

drop policy if exists orders_tenant_insert on public.orders;
create policy orders_tenant_insert
on public.orders
as restrictive
for insert
to authenticated
with check (
  private.is_active_store(organization_id, store_id)
  and (
    user_id = (select auth.uid())
    or private.is_organization_member(organization_id)
  )
);

drop policy if exists order_items_tenant_insert on public.order_items;
create policy order_items_tenant_insert
on public.order_items
as restrictive
for insert
to authenticated
with check (
  exists (
    select 1
    from public.orders parent_order
    where parent_order.id = order_id
      and parent_order.organization_id = order_items.organization_id
      and parent_order.store_id = order_items.store_id
      and (
        parent_order.user_id = (select auth.uid())
        or private.is_organization_member(parent_order.organization_id)
      )
  )
);

drop policy if exists prescriptions_tenant_insert on public.prescriptions;
create policy prescriptions_tenant_insert
on public.prescriptions
as restrictive
for insert
to authenticated
with check (
  private.is_active_store(organization_id, store_id)
  and (
    user_id = (select auth.uid())
    or private.is_organization_member(organization_id)
  )
);

do $member_inserts$
declare
  transaction_table text;
begin
  foreach transaction_table in array array[
    'order_events',
    'payment_errors',
    'payment_events',
    'refund_requests',
    'refund_items',
    'admin_notifications'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      transaction_table || '_tenant_insert',
      transaction_table
    );
    execute format(
      'create policy %I on public.%I as restrictive
         for insert to authenticated
         with check (private.is_organization_member(organization_id))',
      transaction_table || '_tenant_insert',
      transaction_table
    );
  end loop;
end;
$member_inserts$;

-- Restrictive SELECT policies protect PII even when a legacy global admin or
-- seller policy is permissive.
drop policy if exists orders_tenant_select on public.orders;
create policy orders_tenant_select
on public.orders
as restrictive
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_organization_member(organization_id)
);

drop policy if exists prescriptions_tenant_select on public.prescriptions;
create policy prescriptions_tenant_select
on public.prescriptions
as restrictive
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_organization_member(organization_id)
);

drop policy if exists order_items_tenant_select on public.order_items;
create policy order_items_tenant_select
on public.order_items
as restrictive
for select
to authenticated
using (
  exists (
    select 1
    from public.orders parent_order
    where parent_order.id = order_id
      and parent_order.organization_id = order_items.organization_id
      and parent_order.store_id = order_items.store_id
      and (
        parent_order.user_id = (select auth.uid())
        or private.is_organization_member(parent_order.organization_id)
      )
  )
);

drop policy if exists order_events_tenant_select on public.order_events;
create policy order_events_tenant_select
on public.order_events
as restrictive
for select
to authenticated
using (
  exists (
    select 1
    from public.orders parent_order
    where parent_order.id = order_id
      and parent_order.organization_id = order_events.organization_id
      and parent_order.store_id = order_events.store_id
      and (
        parent_order.user_id = (select auth.uid())
        or private.is_organization_member(parent_order.organization_id)
      )
  )
);

do $member_selects$
declare
  transaction_table text;
begin
  foreach transaction_table in array array[
    'payment_errors',
    'payment_events',
    'refund_requests',
    'refund_items',
    'admin_notifications'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      transaction_table || '_tenant_select',
      transaction_table
    );
    execute format(
      'create policy %I on public.%I as restrictive
         for select to authenticated
         using (private.is_organization_member(organization_id))',
      transaction_table || '_tenant_select',
      transaction_table
    );
  end loop;
end;
$member_selects$;

-- Profiles and saved addresses are user-global, but operators may only read
-- customers who have an order in one of their organizations.
drop policy if exists profiles_tenant_select on public.profiles;
create policy profiles_tenant_select
on public.profiles
as restrictive
for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.orders customer_order
    where customer_order.user_id = profiles.id
      and private.is_organization_member(customer_order.organization_id)
  )
);

drop policy if exists customer_addresses_tenant_select on public.customer_addresses;
create policy customer_addresses_tenant_select
on public.customer_addresses
as restrictive
for select
to authenticated
using (
  customer_id = (select auth.uid())
  or exists (
    select 1
    from public.orders customer_order
    where customer_order.user_id = customer_addresses.customer_id
      and private.is_organization_member(customer_order.organization_id)
  )
);

-- Composite relationships prevent a transaction from pointing at another
-- tenant. NOT VALID protects rollout from historical orphans while enforcing
-- the rule for all new rows.
do $transaction_relations$
declare
  relation record;
begin
  for relation in
    select *
    from (values
      ('order_items', 'order_id', 'orders', 'order_items_order_same_tenant_fk'),
      ('order_items', 'product_id', 'products', 'order_items_product_same_tenant_fk'),
      ('order_items', 'variant_id', 'product_variants', 'order_items_variant_same_tenant_fk'),
      ('order_events', 'order_id', 'orders', 'order_events_order_same_tenant_fk'),
      ('prescriptions', 'product_id', 'products', 'prescriptions_product_same_tenant_fk'),
      ('payment_errors', 'order_id', 'orders', 'payment_errors_order_same_tenant_fk'),
      ('payment_events', 'order_id', 'orders', 'payment_events_order_same_tenant_fk'),
      ('refund_requests', 'order_id', 'orders', 'refund_requests_order_same_tenant_fk'),
      ('refund_items', 'refund_request_id', 'refund_requests', 'refund_items_request_same_tenant_fk'),
      ('refund_items', 'order_item_id', 'order_items', 'refund_items_order_item_same_tenant_fk'),
      ('refund_items', 'product_id', 'products', 'refund_items_product_same_tenant_fk'),
      ('admin_notifications', 'order_id', 'orders', 'admin_notifications_order_same_tenant_fk'),
      ('stock_movements', 'order_id', 'orders', 'stock_movements_order_same_tenant_fk')
    ) as relations(child_table, child_column, parent_table, constraint_name)
  loop
    if not exists (
      select 1
      from information_schema.columns transaction_column
      where transaction_column.table_schema = 'public'
        and transaction_column.table_name = relation.child_table
        and transaction_column.column_name = relation.child_column
    ) then
      raise exception 'required relationship column %.% is missing',
        relation.child_table,
        relation.child_column;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = relation.constraint_name
        and conrelid = format('public.%I', relation.child_table)::regclass
    ) then
      execute format(
        'alter table public.%I
           add constraint %I
           foreign key (organization_id, store_id, %I)
           references public.%I (organization_id, store_id, id)
           not valid',
        relation.child_table,
        relation.constraint_name,
        relation.child_column,
        relation.parent_table
      );
    end if;
  end loop;
end;
$transaction_relations$;

commit;
