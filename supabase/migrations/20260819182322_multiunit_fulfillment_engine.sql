-- Multiunit Fulfillment Engine
-- Escolhe a melhor unidade, reserva, confirma ou libera estoque por pedido.

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
language plpgsql stable security definer
set search_path=''
as $$
begin
  if _items is null or jsonb_typeof(_items)<>'array' or jsonb_array_length(_items)=0 then
    raise exception 'Carrinho vazio';
  end if;
  if jsonb_array_length(_items)>80 then
    raise exception 'Carrinho excede o limite de itens para roteamento';
  end if;
  if _delivery_type not in ('delivery','pickup') then
    raise exception 'Tipo de entrega inválido';
  end if;

  return query
  with requested as (
    select x.product_id,x.quantity
    from jsonb_to_recordset(_items) as x(product_id uuid,quantity numeric)
    where x.product_id is not null and x.quantity>0
  ),
  store_eval as (
    select
      s.id,s.name,s.code,
      private.distance_km(_customer_lat,_customer_lng,s.latitude,s.longitude) dist,
      s.service_radius_km,s.preparation_minutes,s.fulfillment_priority,
      count(*) filter(where coalesce(ib.available,0)>=r.quantity)::integer covered,
      count(*)::integer item_count,
      count(*) filter(where coalesce(ib.available,0)<r.quantity)::integer missing,
      coalesce(sum(r.quantity),0)::numeric requested_units,
      coalesce(sum(least(coalesce(ib.available,0),r.quantity)),0)::numeric available_units
    from public.stores s
    cross join requested r
    left join public.inventory_balances ib
      on ib.tenant_id=s.tenant_id and ib.store_id=s.id and ib.product_id=r.product_id
    where s.tenant_id=_tenant_id
      and s.active=true
      and s.ecommerce_fulfillment_enabled=true
      and ((_delivery_type='pickup' and s.pickup_enabled=true)
        or (_delivery_type='delivery' and s.delivery_enabled=true))
    group by s.id,s.name,s.code,s.latitude,s.longitude,s.service_radius_km,
      s.preparation_minutes,s.fulfillment_priority
  ),
  eligible as (
    select e.*,(e.missing=0) is_complete
    from store_eval e
    cross join public.fulfillment_policies fp
    where fp.tenant_id=_tenant_id
      and (
        _delivery_type='pickup'
        or _customer_lat is null or _customer_lng is null
        or fp.require_delivery_radius=false
        or (e.dist is not null and e.dist<=least(fp.max_search_km,e.service_radius_km))
      )
  )
  select
    row_number() over(order by
      e.is_complete desc,
      e.covered desc,
      case when e.dist is null then 999999 else e.dist end asc,
      e.fulfillment_priority asc,
      e.name asc
    ),
    e.id,e.name,e.code,e.dist,e.is_complete,e.covered,e.item_count,e.missing,
    e.requested_units,e.available_units,e.service_radius_km,e.preparation_minutes,e.fulfillment_priority
  from eligible e
  order by 1;
end;
$$;

-- Server-side only: the storefront must call this through a trusted backend.
revoke all on function public.get_fulfillment_candidates(uuid,jsonb,numeric,numeric,text)
  from public,anon,authenticated;
grant execute on function public.get_fulfillment_candidates(uuid,jsonb,numeric,numeric,text)
  to service_role;

create or replace function public.assign_order_fulfillment_internal(_order_id uuid)
returns jsonb
language plpgsql security definer
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
    v_order.tenant_id,
    v_items,
    v_order.delivery_lat,
    v_order.delivery_lng,
    case when coalesce(v_order.delivery_type,v_order.delivery_method)='pickup'
      then 'pickup' else 'delivery' end
  ) c
  where c.complete_cart=true
  order by c.candidate_rank
  limit 1;

  if v_store.store_id is null then
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
      v_order.tenant_id,v_store.store_id,_order_id,v_item.product_id,v_item.quantity,
      'active',v_reserve_until,
      'order-reserve:'||_order_id::text||':'||v_item.product_id::text
    ) on conflict(tenant_id,idempotency_key) do nothing;
  end loop;

  update public.orders
  set store_id=v_store.store_id,
      fulfillment_assigned_at=now(),
      fulfillment_assignment_source=case
        when coalesce(v_order.delivery_type,v_order.delivery_method)='pickup' then 'pickup'
        else 'automatic' end,
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
    'ok',true,
    'store_id',v_store.store_id,
    'store_name',v_store.store_name,
    'distance_km',v_store.distance_km,
    'reserved_until',v_reserve_until
  );
end;
$$;
revoke all on function public.assign_order_fulfillment_internal(uuid) from public,anon,authenticated;
grant execute on function public.assign_order_fulfillment_internal(uuid) to service_role;

create or replace function public.commit_order_inventory_internal(_order_id uuid)
returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  r public.order_inventory_reservations%rowtype;
  v_count integer:=0;
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

create or replace function public.release_order_inventory_internal(
  _order_id uuid,
  _reason text default 'released'
) returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  r public.order_inventory_reservations%rowtype;
  v_count integer:=0;
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
