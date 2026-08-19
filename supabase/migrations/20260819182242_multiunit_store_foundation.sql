-- Multiunit Store Foundation
-- Matriz/filiais, política de fulfillment e reserva por pedido.

alter table public.stores add column if not exists store_type text not null default 'branch'
  check (store_type in ('headquarters','branch','distribution_center'));
alter table public.stores add column if not exists is_headquarters boolean not null default false;
alter table public.stores add column if not exists latitude numeric(10,7) null;
alter table public.stores add column if not exists longitude numeric(10,7) null;
alter table public.stores add column if not exists phone text null;
alter table public.stores add column if not exists delivery_enabled boolean not null default true;
alter table public.stores add column if not exists pickup_enabled boolean not null default true;
alter table public.stores add column if not exists ecommerce_fulfillment_enabled boolean not null default true;
alter table public.stores add column if not exists service_radius_km numeric(8,2) not null default 18 check(service_radius_km > 0);
alter table public.stores add column if not exists fulfillment_priority integer not null default 100 check(fulfillment_priority >= 0);
alter table public.stores add column if not exists preparation_minutes integer not null default 20 check(preparation_minutes >= 0);
alter table public.stores add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists stores_one_headquarters_per_tenant_uq
  on public.stores(tenant_id) where is_headquarters=true and active=true;
create index if not exists stores_fulfillment_idx
  on public.stores(tenant_id,active,ecommerce_fulfillment_enabled,fulfillment_priority);

update public.stores
set is_headquarters=true,
    store_type='headquarters',
    fulfillment_priority=10,
    delivery_enabled=true,
    pickup_enabled=true,
    ecommerce_fulfillment_enabled=true,
    service_radius_km=18,
    updated_at=now()
where id=(select id from public.stores order by created_at limit 1)
  and (select count(*) from public.stores)=1;

create table if not exists public.fulfillment_policies (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  strategy text not null default 'closest_complete_cart'
    check(strategy in ('closest_complete_cart','priority_then_distance','closest_available')),
  prefer_complete_cart boolean not null default true,
  allow_split_order boolean not null default false,
  fallback_to_headquarters boolean not null default true,
  reservation_minutes integer not null default 30 check(reservation_minutes between 5 and 240),
  max_search_km numeric(8,2) not null default 30 check(max_search_km > 0),
  require_delivery_radius boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.fulfillment_policies(tenant_id)
select id from public.tenants where active=true
on conflict(tenant_id) do nothing;

alter table public.orders add column if not exists delivery_lat numeric(10,7) null;
alter table public.orders add column if not exists delivery_lng numeric(10,7) null;
alter table public.orders add column if not exists fulfillment_assigned_at timestamptz null;
alter table public.orders add column if not exists fulfillment_assignment_source text null
  check(fulfillment_assignment_source is null or fulfillment_assignment_source in ('automatic','manual','pickup','fallback'));
alter table public.orders add column if not exists fulfillment_distance_km numeric(10,3) null;
alter table public.orders add column if not exists fulfillment_snapshot jsonb not null default '{}'::jsonb;
create index if not exists orders_store_fulfillment_idx on public.orders(tenant_id,store_id,created_at desc);

create table if not exists public.order_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check(quantity > 0),
  status text not null default 'active'
    check(status in ('active','committed','released','expired','cancelled')),
  expires_at timestamptz not null,
  committed_at timestamptz null,
  released_at timestamptz null,
  release_reason text null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,idempotency_key)
);
create unique index if not exists order_inventory_reservation_active_uq
  on public.order_inventory_reservations(order_id,product_id) where status='active';
create index if not exists order_inventory_reservations_expiry_idx
  on public.order_inventory_reservations(status,expires_at);
create index if not exists order_inventory_reservations_store_idx
  on public.order_inventory_reservations(tenant_id,store_id,status,created_at desc);
create index if not exists order_inventory_reservations_order_idx on public.order_inventory_reservations(order_id);
create index if not exists order_inventory_reservations_product_idx on public.order_inventory_reservations(product_id);

alter table public.fulfillment_policies enable row level security;
alter table public.order_inventory_reservations enable row level security;

create policy fulfillment_policies_member_read on public.fulfillment_policies
for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));
create policy fulfillment_policies_admin_manage on public.fulfillment_policies
for all to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager']))
with check(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager']));
create policy order_inventory_reservations_staff_read on public.order_inventory_reservations
for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));
