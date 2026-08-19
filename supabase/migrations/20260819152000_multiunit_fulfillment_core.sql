-- Multiunit Fulfillment Core
-- Matrix/filiais, estoque por unidade, escolha da melhor loja, reserva e transferencias.
-- Additive and staging-first.

-- ---------------------------------------------------------------------------
-- Store operational profile
-- ---------------------------------------------------------------------------
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

-- The current single store becomes the matrix in staging.
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

-- ---------------------------------------------------------------------------
-- Tenant fulfillment policy
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Order routing fields
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists delivery_lat numeric(10,7) null;
alter table public.orders add column if not exists delivery_lng numeric(10,7) null;
alter table public.orders add column if not exists fulfillment_assigned_at timestamptz null;
alter table public.orders add column if not exists fulfillment_assignment_source text null
  check(fulfillment_assignment_source is null or fulfillment_assignment_source in ('automatic','manual','pickup','fallback'));
alter table public.orders add column if not exists fulfillment_distance_km numeric(10,3) null;
alter table public.orders add column if not exists fulfillment_snapshot jsonb not null default '{}'::jsonb;
create index if not exists orders_store_fulfillment_idx on public.orders(tenant_id,store_id,created_at desc);

-- ---------------------------------------------------------------------------
-- Inventory reservations per order
-- ---------------------------------------------------------------------------
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
  on public.order_inventory_reservations(order_id,product_id)
  where status='active';
create index if not exists order_inventory_reservations_expiry_idx
  on public.order_inventory_reservations(status,expires_at);
create index if not exists order_inventory_reservations_store_idx
  on public.order_inventory_reservations(tenant_id,store_id,status,created_at desc);

-- ---------------------------------------------------------------------------
-- Distance helper (Haversine, no PostGIS dependency)
-- ---------------------------------------------------------------------------
create or replace function private.distance_km(
  _lat1 numeric,_lng1 numeric,_lat2 numeric,_lng2 numeric
) returns numeric
language sql immutable
set search_path=''
as $$
  select case
    when _lat1 is null or _lng1 is null or _lat2 is null or _lng2 is null then null
    else round((
      6371 * 2 * asin(
        sqrt(
          power(sin((radians(_lat2::double precision)-radians(_lat1::double precision))/2),2)
          + cos(radians(_lat1::double precision))*cos(radians(_lat2::double precision))
          * power(sin((radians(_lng2::double precision)-radians(_lng1::double precision))/2),2)
        )
      )
    )::numeric,3)
  end;
$$;
revoke all on function private.distance_km(numeric,numeric,numeric,numeric) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Candidate engine: complete cart > proximity > store priority.
-- Returns only operational data needed by storefront/admin, not full inventory.
-- ---------------------------------------------------------------------------
create or replace function public.get_fulfillment_candidates(
  _tenant_id uuid,
  _items jsonb,
  _customer_lat numeric default null,
  _customer_lng numeric default null,
  _delivery_type text default 'delivery'
)
returns table(
  candidate_rank bigint,
  store_id uuid,
  store_name text,
  store_code text,
  distance_km numeric,
  complete_cart boolean,
  covered_items integer,
  total_items integer,
  missing_items integer,
  total_requested_units numeric,
  total_available_units numeric,
  service_radius_km numeric,
  preparation_minutes integer,
  fulfillment_priority integer
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items)=0 then
    raise exception 'Carrinho vazio';
  end if;
  if jsonb_array_length(_items) > 80 then
    raise exception 'Carrinho excede o limite de itens para roteamento';
  end if;
  if _delivery_type not in ('delivery','pickup') then
    raise exception 'Tipo de entrega inválido';
  end if;

  return query
  with requested as (
    select x.product_id,x.quantity
    from jsonb_to_recordset(_items) as x(product_id uuid,quantity numeric)
    where x.product_id is not null and x.quantity > 0
  ),
  req_totals as (
    select count(*)::integer item_count,coalesce(sum(quantity),0)::numeric requested_units from requested
  ),
  store_eval as (
    select
      s.id,
      s.name,
      s.code,
      private.distance_km(_customer_lat,_customer_lng,s.latitude,s.longitude) as dist,
      s.service_radius_km,
      s.preparation_minutes,
      s.fulfillment_priority,
      count(*) filter(where coalesce(ib.available,0) >= r.quantity)::integer as covered,
      count(*)::integer as item_count,
      count(*) filter(where coalesce(ib.available,0) < r.quantity)::integer as missing,
      coalesce(sum(r.quantity),0)::numeric as requested_units,
      coalesce(sum(least(coalesce(ib.available,0),r.quantity)),0)::numeric as available_units
    from public.stores s
    cross join requested r
    left join public.inventory_balances ib
      on ib.tenant_id=s.tenant_id and ib.store_id=s.id and ib.product_id=r.product_id
    where s.tenant_id=_tenant_id
      and s.active=true
      and s.ecommerce_fulfillment_enabled=true
      and ((_delivery_type='pickup' and s.pickup_enabled=true) or (_delivery_type='delivery' and s.delivery_enabled=true))
    group by s.id,s.name,s.code,s.latitude,s.longitude,s.service_radius_km,s.preparation_minutes,s.fulfillment_priority
  ),
  eligible as (
    select e.*,
      (e.missing=0) as is_complete
    from store_eval e
    cross join public.fulfillment_policies fp
    where fp.tenant_id=_tenant_id
      and (
        _delivery_type='pickup'
        or _customer_lat is null or _customer_lng is null
        or fp.require_delivery_radius=false
        or (e.dist is not null and e.dist <= least(fp.max_search_km,e.service_radius_km))
      )
  )
  select
    row_number() over(order by
      e.is_complete desc,
      e.covered desc,
      case when e.dist is null then 999999 else e.dist end asc,
      e.fulfillment_priority asc,
      e.name asc
    ) as candidate_rank,
    e.id,e.name,e.code,e.dist,e.is_complete,e.covered,e.item_count,e.missing,
    e.requested_units,e.available_units,e.service_radius_km,e.preparation_minutes,e.fulfillment_priority
  from eligible e
  order by candidate_rank;
end;
$$;
revoke all on function public.get_fulfillment_candidates(uuid,jsonb,numeric,numeric,text) from public;
grant execute on function public.get_fulfillment_candidates(uuid,jsonb,numeric,numeric,text) to anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Assign and reserve an order atomically. Server-side only.
-- ---------------------------------------------------------------------------
create or replace function public.assign_order_fulfillment_internal(_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_policy public.fulfillment_policies%rowtype;
  v_items jsonb;
  v_store record;
  v_reserve_until timestamptz;
  v_item record;
  v_existing integer;
begin
  select * into v_order from public.orders where id=_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.tenant_id is null then raise exception 'Pedido sem tenant'; end if;

  select * into v_policy from public.fulfillment_policies where tenant_id=v_order.tenant_id;
  if not found then raise exception 'Política de fulfillment não configurada'; end if;

  select count(*) into v_existing
  from public.order_inventory_reservations
  where order_id=_order_id and status='active';
  if v_existing>0 and v_order.store_id is not null then
    return jsonb_build_object('ok',true,'already_assigned',true,'store_id',v_order.store_id);
  end if;

  select jsonb_agg(jsonb_build_object('product_id',oi.product_id,'quantity',oi.quantity))
  into v_items
  from public.order_items oi
  where oi.order_id=_order_id and oi.product_id is not null and oi.item_status<>'removido';

  if v_items is null then raise exception 'Pedido sem itens roteáveis'; end if;

  select * into v_store
  from public.get_fulfillment_candidates(
    v_order.tenant_id,v_items,v_order.delivery_lat,v_order.delivery_lng,
    case when coalesce(v_order.delivery_type,v_order.delivery_method)='pickup' then 'pickup' else 'delivery' end
  ) c
  where c.complete_cart=true
  order by c.candidate_rank
  limit 1;

  if v_store.store_id is null then
    if v_policy.allow_split_order then
      raise exception 'Split order ainda não está habilitado para criação automática';
    end if;
    raise exception 'Nenhuma unidade consegue atender o carrinho completo';
  end if;

  v_reserve_until:=now()+make_interval(mins=>v_policy.reservation_minutes);

  for v_item in
    select oi.product_id,sum(oi.quantity)::numeric quantity
    from public.order_items oi
    where oi.order_id=_order_id and oi.product_id is not null and oi.item_status<>'removido'
    group by oi.product_id
  loop
    insert into public.inventory_ledger(
      tenant_id,store_id,product_id,movement_type,on_hand_delta,reserved_delta,
      source_type,source_id,reference,idempotency_key,metadata
    ) values(
      v_order.tenant_id,v_store.store_id,v_item.product_id,'reservation',0,v_item.quantity,
      'order',_order_id::text,'Reserva e-commerce',
      'order-reserve:'||_order_id::text||':'||v_item.product_id::text,
      jsonb_build_object('expires_at',v_reserve_until,'assignment','automatic')
    ) on conflict do nothing;

    insert into public.order_inventory_reservations(
      tenant_id,store_id,order_id,product_id,quantity,status,expires_at,idempotency_key
    ) values(
      v_order.tenant_id,v_store.store_id,_order_id,v_item.product_id,v_item.quantity,'active',v_reserve_until,
      'order-reserve:'||_order_id::text||':'||v_item.product_id::text
    ) on conflict(tenant_id,idempotency_key) do nothing;
  end loop;

  update public.orders
  set store_id=v_store.store_id,
      fulfillment_assigned_at=now(),
      fulfillment_assignment_source=case when coalesce(v_order.delivery_type,v_order.delivery_method)='pickup' then 'pickup' else 'automatic' end,
      fulfillment_distance_km=v_store.distance_km,
      fulfillment_snapshot=jsonb_build_object(
        'store_name',v_store.store_name,
        'distance_km',v_store.distance_km,
        'complete_cart',v_store.complete_cart,
        'preparation_minutes',v_store.preparation_minutes,
        'reserved_until',v_reserve_until
      ),
      updated_at=now()
  where id=_order_id;

  return jsonb_build_object(
    'ok',true,'store_id',v_store.store_id,'store_name',v_store.store_name,
    'distance_km',v_store.distance_km,'reserved_until',v_reserve_until
  );
end;
$$;
revoke all on function public.assign_order_fulfillment_internal(uuid) from public,anon,authenticated;
grant execute on function public.assign_order_fulfillment_internal(uuid) to service_role;

-- Commit reservation after approved payment: reserved -> physical sale.
create or replace function public.commit_order_inventory_internal(_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare r public.order_inventory_reservations%rowtype; v_count integer:=0;
begin
  for r in
    select * from public.order_inventory_reservations
    where order_id=_order_id and status='active'
    order by created_at,id for update
  loop
    insert into public.inventory_ledger(
      tenant_id,store_id,product_id,movement_type,on_hand_delta,reserved_delta,
      source_type,source_id,reference,idempotency_key,metadata
    ) values(
      r.tenant_id,r.store_id,r.product_id,'sale',-r.quantity,-r.quantity,
      'order',_order_id::text,'Venda e-commerce',
      'order-commit:'||_order_id::text||':'||r.product_id::text,'{}'::jsonb
    ) on conflict do nothing;
    update public.order_inventory_reservations
    set status='committed',committed_at=now(),updated_at=now()
    where id=r.id;
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('ok',true,'committed_items',v_count);
end;
$$;
revoke all on function public.commit_order_inventory_internal(uuid) from public,anon,authenticated;
grant execute on function public.commit_order_inventory_internal(uuid) to service_role;

-- Release reservation on expiry/cancellation/payment failure.
create or replace function public.release_order_inventory_internal(_order_id uuid,_reason text default 'released')
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare r public.order_inventory_reservations%rowtype; v_count integer:=0;
begin
  for r in
    select * from public.order_inventory_reservations
    where order_id=_order_id and status='active'
    order by created_at,id for update
  loop
    insert into public.inventory_ledger(
      tenant_id,store_id,product_id,movement_type,on_hand_delta,reserved_delta,
      source_type,source_id,reference,idempotency_key,metadata
    ) values(
      r.tenant_id,r.store_id,r.product_id,'release',0,-r.quantity,
      'order',_order_id::text,'Liberação de reserva',
      'order-release:'||_order_id::text||':'||r.product_id::text,
      jsonb_build_object('reason',_reason)
    ) on conflict do nothing;
    update public.order_inventory_reservations
    set status=case when _reason='expired' then 'expired' else 'released' end,
        released_at=now(),release_reason=_reason,updated_at=now()
    where id=r.id;
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('ok',true,'released_items',v_count);
end;
$$;
revoke all on function public.release_order_inventory_internal(uuid,text) from public,anon,authenticated;
grant execute on function public.release_order_inventory_internal(uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- Inter-store transfers
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_store_id uuid not null references public.stores(id) on delete restrict,
  destination_store_id uuid not null references public.stores(id) on delete restrict,
  status text not null default 'draft'
    check(status in ('draft','approved','in_transit','received','cancelled')),
  requested_by uuid null references auth.users(id),
  approved_by uuid null references auth.users(id),
  dispatched_by uuid null references auth.users(id),
  received_by uuid null references auth.users(id),
  approved_at timestamptz null,
  dispatched_at timestamptz null,
  received_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(source_store_id<>destination_store_id)
);
create index if not exists inventory_transfers_status_idx
  on public.inventory_transfers(tenant_id,status,created_at desc);

create table if not exists public.inventory_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.inventory_transfers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check(quantity>0),
  batch_number text null,
  expiry_date date null,
  unit_cost numeric(14,4) null,
  dispatched boolean not null default false,
  received boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inventory_transfer_items_transfer_idx on public.inventory_transfer_items(transfer_id);

create or replace function public.dispatch_inventory_transfer_internal(_transfer_id uuid,_actor_id uuid default null)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare t public.inventory_transfers%rowtype; i public.inventory_transfer_items%rowtype; v_count integer:=0;
begin
  select * into t from public.inventory_transfers where id=_transfer_id for update;
  if not found then raise exception 'Transferência não encontrada'; end if;
  if t.status='in_transit' then return jsonb_build_object('ok',true,'already_dispatched',true); end if;
  if t.status not in ('approved','draft') then raise exception 'Transferência não pode ser despachada no status %',t.status; end if;

  for i in select * from public.inventory_transfer_items where transfer_id=t.id order by created_at,id for update loop
    if not i.dispatched then
      insert into public.inventory_ledger(
        tenant_id,store_id,product_id,movement_type,on_hand_delta,reserved_delta,unit_cost,
        source_type,source_id,reference,idempotency_key,metadata,created_by
      ) values(
        t.tenant_id,t.source_store_id,i.product_id,'transfer_out',-i.quantity,0,i.unit_cost,
        'inventory_transfer',t.id::text,'Transferência entre unidades',
        'transfer-out:'||t.id::text||':'||i.id::text,
        jsonb_build_object('destination_store_id',t.destination_store_id,'batch_number',i.batch_number,'expiry_date',i.expiry_date),_actor_id
      ) on conflict do nothing;
      update public.inventory_transfer_items set dispatched=true,updated_at=now() where id=i.id;
      v_count:=v_count+1;
    end if;
  end loop;
  update public.inventory_transfers
  set status='in_transit',dispatched_by=_actor_id,dispatched_at=now(),updated_at=now()
  where id=t.id;
  return jsonb_build_object('ok',true,'dispatched_items',v_count);
end;
$$;
revoke all on function public.dispatch_inventory_transfer_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dispatch_inventory_transfer_internal(uuid,uuid) to service_role;

create or replace function public.receive_inventory_transfer_internal(_transfer_id uuid,_actor_id uuid default null)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare t public.inventory_transfers%rowtype; i public.inventory_transfer_items%rowtype; v_count integer:=0; v_lot uuid;
begin
  select * into t from public.inventory_transfers where id=_transfer_id for update;
  if not found then raise exception 'Transferência não encontrada'; end if;
  if t.status='received' then return jsonb_build_object('ok',true,'already_received',true); end if;
  if t.status<>'in_transit' then raise exception 'Transferência ainda não está em trânsito'; end if;

  for i in select * from public.inventory_transfer_items where transfer_id=t.id order by created_at,id for update loop
    if not i.received then
      v_lot:=null;
      if nullif(trim(coalesce(i.batch_number,'')),'') is not null then
        select il.id into v_lot from public.inventory_lots il
        where il.tenant_id=t.tenant_id and il.store_id=t.destination_store_id and il.product_id=i.product_id
          and il.batch_number=i.batch_number and il.expiry_date is not distinct from i.expiry_date
        limit 1;
        if v_lot is null then
          insert into public.inventory_lots(tenant_id,store_id,product_id,batch_number,expiry_date,unit_cost,metadata)
          values(t.tenant_id,t.destination_store_id,i.product_id,i.batch_number,i.expiry_date,i.unit_cost,
            jsonb_build_object('source','inventory_transfer','transfer_id',t.id)) returning id into v_lot;
        end if;
      end if;

      insert into public.inventory_ledger(
        tenant_id,store_id,product_id,lot_id,movement_type,on_hand_delta,reserved_delta,unit_cost,
        source_type,source_id,reference,idempotency_key,metadata,created_by
      ) values(
        t.tenant_id,t.destination_store_id,i.product_id,v_lot,'transfer_in',i.quantity,0,i.unit_cost,
        'inventory_transfer',t.id::text,'Transferência recebida',
        'transfer-in:'||t.id::text||':'||i.id::text,
        jsonb_build_object('source_store_id',t.source_store_id,'batch_number',i.batch_number,'expiry_date',i.expiry_date),_actor_id
      ) on conflict do nothing;
      update public.inventory_transfer_items set received=true,updated_at=now() where id=i.id;
      v_count:=v_count+1;
    end if;
  end loop;
  update public.inventory_transfers
  set status='received',received_by=_actor_id,received_at=now(),updated_at=now()
  where id=t.id;
  return jsonb_build_object('ok',true,'received_items',v_count);
end;
$$;
revoke all on function public.receive_inventory_transfer_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.receive_inventory_transfer_internal(uuid,uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Views for matrix/branch management
-- ---------------------------------------------------------------------------
create or replace view public.store_inventory_summary
with (security_invoker=true)
as
select
  s.tenant_id,s.id as store_id,s.name as store_name,s.code,s.store_type,s.is_headquarters,
  s.active,s.delivery_enabled,s.pickup_enabled,s.ecommerce_fulfillment_enabled,
  s.service_radius_km,s.fulfillment_priority,s.preparation_minutes,
  count(ib.product_id)::bigint as catalog_items,
  count(*) filter(where ib.on_hand>0)::bigint as items_with_stock,
  count(*) filter(where ib.available<=coalesce(ib.minimum_stock,0))::bigint as low_stock_items,
  coalesce(sum(ib.on_hand),0)::numeric as total_units,
  coalesce(sum(ib.reserved),0)::numeric as reserved_units,
  coalesce(sum(ib.available),0)::numeric as available_units
from public.stores s
left join public.inventory_balances ib on ib.tenant_id=s.tenant_id and ib.store_id=s.id
group by s.tenant_id,s.id,s.name,s.code,s.store_type,s.is_headquarters,s.active,
  s.delivery_enabled,s.pickup_enabled,s.ecommerce_fulfillment_enabled,s.service_radius_km,
  s.fulfillment_priority,s.preparation_minutes;

grant select on public.store_inventory_summary to authenticated;

create or replace view public.store_inventory_catalog
with (security_invoker=true)
as
select
  ib.tenant_id,ib.store_id,s.name as store_name,ib.product_id,
  p.name as product_name,p.sku,p.barcode,p.image_url,
  ib.on_hand,ib.reserved,ib.available,ib.minimum_stock,ib.updated_at
from public.inventory_balances ib
join public.stores s on s.id=ib.store_id and s.tenant_id=ib.tenant_id
join public.products p on p.id=ib.product_id;

grant select on public.store_inventory_catalog to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.fulfillment_policies enable row level security;
alter table public.order_inventory_reservations enable row level security;
alter table public.inventory_transfers enable row level security;
alter table public.inventory_transfer_items enable row level security;

create policy fulfillment_policies_member_read on public.fulfillment_policies
for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));
create policy fulfillment_policies_admin_manage on public.fulfillment_policies
for all to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager']))
with check(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager']));

create policy order_inventory_reservations_staff_read on public.order_inventory_reservations
for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));

create policy inventory_transfers_member_read on public.inventory_transfers
for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));
create policy inventory_transfers_manage on public.inventory_transfers
for all to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']))
with check(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']));

create policy inventory_transfer_items_member_read on public.inventory_transfer_items
for select to authenticated using(exists(
  select 1 from public.inventory_transfers t
  where t.id=inventory_transfer_items.transfer_id and private.is_tenant_member(t.tenant_id,auth.uid())
));
create policy inventory_transfer_items_manage on public.inventory_transfer_items
for all to authenticated
using(exists(
  select 1 from public.inventory_transfers t
  where t.id=inventory_transfer_items.transfer_id
    and private.has_tenant_role(t.tenant_id,auth.uid(),array['owner','admin','manager','inventory'])
))
with check(exists(
  select 1 from public.inventory_transfers t
  where t.id=inventory_transfer_items.transfer_id
    and private.has_tenant_role(t.tenant_id,auth.uid(),array['owner','admin','manager','inventory'])
));

comment on function public.get_fulfillment_candidates(uuid,jsonb,numeric,numeric,text)
  is 'Ranks stores for an ecommerce cart: complete stock first, then distance and operational priority.';
comment on table public.order_inventory_reservations
  is 'Per-store stock reservations that prevent overselling while an ecommerce order is awaiting payment.';
comment on table public.inventory_transfers
  is 'Auditable inventory transfer workflow between matrix and branches.';
