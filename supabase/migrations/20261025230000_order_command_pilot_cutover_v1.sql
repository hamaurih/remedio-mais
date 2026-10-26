
create table if not exists public.order_command_pilot_orders (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid primary key references public.orders(id) on delete cascade,
  enabled boolean not null default true,
  enrolled_by uuid null references auth.users(id),
  enrolled_at timestamptz not null default now(),
  disabled_by uuid null references auth.users(id),
  disabled_at timestamptz null,
  notes text null
);

alter table public.order_command_pilot_orders enable row level security;

create policy order_command_pilot_orders_read_v1
on public.order_command_pilot_orders for select to authenticated
using (private.is_tenant_member(tenant_id,auth.uid()));

create policy order_command_pilot_orders_insert_v1
on public.order_command_pilot_orders for insert to authenticated
with check (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin']));

create policy order_command_pilot_orders_update_v1
on public.order_command_pilot_orders for update to authenticated
using (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin']))
with check (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin']));

create index if not exists order_command_pilot_orders_enabled_idx
on public.order_command_pilot_orders(tenant_id,enabled,enrolled_at desc);

create or replace function public.admin_set_order_command_pilot(
  _order_id uuid,
  _enabled boolean,
  _notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
  from public.orders
  where id=_order_id;

  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.tenant_id is null then raise exception 'Pedido sem tenant'; end if;

  if not private.has_tenant_role(v_order.tenant_id,auth.uid(),array['owner','admin']) then
    raise exception 'Apenas owner/admin pode gerenciar o piloto';
  end if;

  if _enabled and v_order.inventory_state='committed' then
    raise exception 'Pedido já baixado não pode entrar no piloto';
  end if;

  insert into public.order_command_pilot_orders(
    tenant_id,order_id,enabled,enrolled_by,enrolled_at,disabled_by,disabled_at,notes
  ) values (
    v_order.tenant_id,v_order.id,_enabled,
    case when _enabled then auth.uid() else null end,
    case when _enabled then now() else now() end,
    case when _enabled then null else auth.uid() end,
    case when _enabled then null else now() end,
    nullif(trim(coalesce(_notes,'')),'')
  )
  on conflict(order_id) do update set
    enabled=excluded.enabled,
    enrolled_by=case when excluded.enabled then auth.uid() else public.order_command_pilot_orders.enrolled_by end,
    enrolled_at=case when excluded.enabled then now() else public.order_command_pilot_orders.enrolled_at end,
    disabled_by=case when excluded.enabled then null else auth.uid() end,
    disabled_at=case when excluded.enabled then null else now() end,
    notes=coalesce(excluded.notes,public.order_command_pilot_orders.notes);

  insert into public.order_events(order_id,type,message,new_status,metadata,created_by)
  values(
    v_order.id,
    case when _enabled then 'order_command_pilot_enabled' else 'order_command_pilot_disabled' end,
    case when _enabled then 'Pedido incluído no piloto controlado do Order Command v1'
         else 'Pedido removido do piloto controlado do Order Command v1' end,
    v_order.inventory_state,
    jsonb_build_object('pilot_enabled',_enabled,'notes',nullif(trim(coalesce(_notes,'')),'')),
    auth.uid()
  );

  return jsonb_build_object('ok',true,'order_id',v_order.id,'pilot_enabled',_enabled);
end;
$function$;

create or replace function public.admin_order_command_overview()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_tenant_id uuid;
  v_enabled boolean := false;
  v_config jsonb := '{}'::jsonb;
begin
  select tm.tenant_id
  into v_tenant_id
  from public.tenant_memberships tm
  where tm.user_id=auth.uid()
    and tm.active=true
    and tm.role::text in ('owner','admin','manager','inventory')
  order by tm.created_at asc
  limit 1;

  if v_tenant_id is null then
    raise exception 'Sem permissão para consultar o Order Command';
  end if;

  select coalesce((
    select f.enabled from public.erp_feature_flags f
    where f.tenant_id=v_tenant_id and f.key='order_command_v1' limit 1
  ),false),
  coalesce((
    select f.config from public.erp_feature_flags f
    where f.tenant_id=v_tenant_id and f.key='order_command_v1' limit 1
  ),'{}'::jsonb)
  into v_enabled,v_config;

  return jsonb_build_object(
    'enabled',v_enabled,
    'mode',case when v_enabled then 'controlled' else 'pilot' end,
    'tenant_id',v_tenant_id,
    'pilot_count',(
      select count(*) from public.order_command_pilot_orders p
      where p.tenant_id=v_tenant_id and p.enabled=true
    ),
    'counts',jsonb_build_object(
      'none',(select count(*) from public.orders where tenant_id=v_tenant_id and inventory_state='none'),
      'reserved',(select count(*) from public.orders where tenant_id=v_tenant_id and inventory_state='reserved'),
      'committed',(select count(*) from public.orders where tenant_id=v_tenant_id and inventory_state='committed'),
      'released',(select count(*) from public.orders where tenant_id=v_tenant_id and inventory_state='released'),
      'failed',(select count(*) from public.orders where tenant_id=v_tenant_id and inventory_state='failed'),
      'active_reservations',(select count(*) from public.order_inventory_reservations where tenant_id=v_tenant_id and status='active')
    )
  );
end;
$function$;

create or replace function public.admin_order_inventory_command(
  _order_id uuid,
  _action text,
  _reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_order public.orders%rowtype;
  v_global_enabled boolean := false;
  v_pilot_enabled boolean := false;
  v_store_id uuid;
  v_minutes integer := 30;
  v_until timestamptz;
  v_item record;
  v_res public.order_inventory_reservations%rowtype;
  v_count integer := 0;
  v_missing jsonb := '[]'::jsonb;
begin
  if _action not in ('status','reserve','commit','release') then
    raise exception 'Ação inválida';
  end if;

  select * into v_order
  from public.orders
  where id=_order_id
  for update;

  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.tenant_id is null then raise exception 'Pedido sem tenant'; end if;

  if not private.has_tenant_role(v_order.tenant_id,auth.uid(),array['owner','admin','manager','inventory']) then
    raise exception 'Sem permissão para operar reservas deste pedido';
  end if;

  select coalesce((
    select f.enabled
    from public.erp_feature_flags f
    where f.tenant_id=v_order.tenant_id and f.key='order_command_v1'
    limit 1
  ),false)
  into v_global_enabled;

  select coalesce((
    select p.enabled
    from public.order_command_pilot_orders p
    where p.order_id=v_order.id and p.tenant_id=v_order.tenant_id
    limit 1
  ),false)
  into v_pilot_enabled;

  if _action='status' then
    return jsonb_build_object(
      'ok',true,
      'global_enabled',v_global_enabled,
      'pilot_enabled',v_pilot_enabled,
      'order_id',v_order.id,
      'order_code',v_order.order_code,
      'channel',v_order.sales_channel,
      'inventory_state',v_order.inventory_state,
      'reservations',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',r.id,'product_id',r.product_id,'quantity',r.quantity,
          'status',r.status,'expires_at',r.expires_at,'store_id',r.store_id
        ) order by r.created_at)
        from public.order_inventory_reservations r
        where r.order_id=v_order.id
      ),'[]'::jsonb)
    );
  end if;

  if not (v_global_enabled or v_pilot_enabled) then
    raise exception 'Pedido não está habilitado para o piloto do Order Command';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_order.id::text,0));

  if _action='reserve' then
    if v_order.inventory_state='committed' then
      raise exception 'Estoque deste pedido já foi baixado';
    end if;
    if coalesce(v_order.payment_status,'pending') in ('cancelled','refunded','rejected','chargeback') or v_order.status='cancelado' then
      raise exception 'Pedido cancelado/terminal não pode reservar estoque';
    end if;

    if exists(select 1 from public.order_inventory_reservations where order_id=v_order.id and status='active') then
      return jsonb_build_object('ok',true,'already_reserved',true,'order_id',v_order.id,'inventory_state','reserved');
    end if;

    v_store_id:=v_order.store_id;
    if v_store_id is null then
      select s.id into v_store_id
      from public.stores s
      where s.tenant_id=v_order.tenant_id and s.active=true
      order by s.is_headquarters desc nulls last,s.fulfillment_priority asc,s.created_at asc
      limit 1;
    end if;
    if v_store_id is null then raise exception 'Nenhuma unidade ativa disponível para reserva'; end if;

    select coalesce(fp.reservation_minutes,30) into v_minutes
    from public.fulfillment_policies fp
    where fp.tenant_id=v_order.tenant_id;
    v_minutes:=coalesce(v_minutes,30);
    v_until:=now()+make_interval(mins=>v_minutes);

    for v_item in
      select oi.product_id,sum(oi.quantity)::numeric quantity
      from public.order_items oi
      where oi.order_id=v_order.id
        and oi.product_id is not null
        and oi.item_status<>'removido'
      group by oi.product_id
    loop
      if not exists (
        select 1 from public.inventory_balances ib
        where ib.tenant_id=v_order.tenant_id
          and ib.store_id=v_store_id
          and ib.product_id=v_item.product_id
          and ib.available>=v_item.quantity
      ) then
        v_missing:=v_missing || jsonb_build_array(jsonb_build_object(
          'product_id',v_item.product_id,
          'requested',v_item.quantity
        ));
      end if;
    end loop;

    if jsonb_array_length(v_missing)>0 then
      update public.orders
      set inventory_state='failed',inventory_command_version='v1',updated_at=now()
      where id=v_order.id;
      return jsonb_build_object('ok',false,'reason','insufficient_inventory','missing',v_missing);
    end if;

    for v_item in
      select oi.product_id,sum(oi.quantity)::numeric quantity
      from public.order_items oi
      where oi.order_id=v_order.id
        and oi.product_id is not null
        and oi.item_status<>'removido'
      group by oi.product_id
      order by oi.product_id
    loop
      insert into public.inventory_ledger(
        tenant_id,store_id,product_id,movement_type,on_hand_delta,reserved_delta,
        source_type,source_id,reference,idempotency_key,metadata,created_by
      ) values (
        v_order.tenant_id,v_store_id,v_item.product_id,'reservation',0,v_item.quantity,
        'order_command',v_order.id::text,'Reserva Order Command',
        'order-command:v1:reserve:'||v_order.id::text||':'||v_item.product_id::text,
        jsonb_build_object('channel',v_order.sales_channel,'expires_at',v_until,'pilot',v_pilot_enabled),
        auth.uid()
      ) on conflict do nothing;

      insert into public.order_inventory_reservations(
        tenant_id,store_id,order_id,product_id,quantity,status,expires_at,idempotency_key
      ) values (
        v_order.tenant_id,v_store_id,v_order.id,v_item.product_id,v_item.quantity,'active',v_until,
        'order-command:v1:reserve:'||v_order.id::text||':'||v_item.product_id::text
      ) on conflict(tenant_id,idempotency_key) do nothing;
      v_count:=v_count+1;
    end loop;

    update public.orders
    set store_id=v_store_id,
        inventory_state='reserved',
        inventory_reserved_at=now(),
        inventory_released_at=null,
        inventory_command_version='v1',
        updated_at=now()
    where id=v_order.id;

    insert into public.order_events(order_id,type,message,new_status,metadata,created_by)
    values(v_order.id,'inventory_reserved','Estoque interno reservado pelo Order Command v1','reserved',
      jsonb_build_object('pilot',v_pilot_enabled,'global_enabled',v_global_enabled),auth.uid());

    return jsonb_build_object('ok',true,'order_id',v_order.id,'store_id',v_store_id,'reserved_items',v_count,'expires_at',v_until,'pilot',v_pilot_enabled);
  end if;

  if _action='commit' then
    if v_order.payment_status<>'approved' then
      raise exception 'Pagamento precisa estar aprovado antes da baixa do estoque';
    end if;
    if v_order.inventory_state='committed' then
      return jsonb_build_object('ok',true,'already_committed',true,'order_id',v_order.id);
    end if;

    for v_res in
      select * from public.order_inventory_reservations
      where order_id=v_order.id and status='active'
      order by created_at,id
      for update
    loop
      insert into public.inventory_ledger(
        tenant_id,store_id,product_id,movement_type,on_hand_delta,reserved_delta,
        source_type,source_id,reference,idempotency_key,metadata,created_by
      ) values (
        v_res.tenant_id,v_res.store_id,v_res.product_id,'sale',-v_res.quantity,-v_res.quantity,
        'order_command',v_order.id::text,'Baixa Order Command',
        'order-command:v1:commit:'||v_order.id::text||':'||v_res.product_id::text,
        jsonb_build_object('channel',v_order.sales_channel,'pilot',v_pilot_enabled),
        auth.uid()
      ) on conflict do nothing;

      update public.order_inventory_reservations
      set status='committed',committed_at=now(),updated_at=now()
      where id=v_res.id;
      v_count:=v_count+1;
    end loop;

    if v_count=0 then raise exception 'Pedido não possui reserva ativa para baixa'; end if;

    update public.orders
    set inventory_state='committed',
        inventory_committed_at=now(),
        inventory_command_version='v1',
        updated_at=now()
    where id=v_order.id;

    update public.order_command_pilot_orders
    set enabled=false,disabled_by=auth.uid(),disabled_at=now()
    where order_id=v_order.id and enabled=true;

    insert into public.order_events(order_id,type,message,new_status,metadata,created_by)
    values(v_order.id,'inventory_committed','Estoque interno baixado pelo Order Command v1','committed',
      jsonb_build_object('pilot',v_pilot_enabled,'pilot_closed',v_pilot_enabled),auth.uid());

    return jsonb_build_object('ok',true,'order_id',v_order.id,'committed_items',v_count,'pilot_closed',v_pilot_enabled);
  end if;

  if _action='release' then
    if v_order.inventory_state='committed' then
      raise exception 'Pedido já teve estoque baixado; use fluxo de devolução/estorno';
    end if;

    for v_res in
      select * from public.order_inventory_reservations
      where order_id=v_order.id and status='active'
      order by created_at,id
      for update
    loop
      insert into public.inventory_ledger(
        tenant_id,store_id,product_id,movement_type,on_hand_delta,reserved_delta,
        source_type,source_id,reference,idempotency_key,metadata,created_by
      ) values (
        v_res.tenant_id,v_res.store_id,v_res.product_id,'release',0,-v_res.quantity,
        'order_command',v_order.id::text,'Liberação Order Command',
        'order-command:v1:release:'||v_order.id::text||':'||v_res.product_id::text,
        jsonb_build_object('reason',coalesce(_reason,'released'),'channel',v_order.sales_channel,'pilot',v_pilot_enabled),
        auth.uid()
      ) on conflict do nothing;

      update public.order_inventory_reservations
      set status=case when coalesce(_reason,'')='expired' then 'expired' else 'released' end,
          released_at=now(),
          release_reason=coalesce(_reason,'released'),
          updated_at=now()
      where id=v_res.id;
      v_count:=v_count+1;
    end loop;

    update public.orders
    set inventory_state='released',
        inventory_released_at=now(),
        inventory_command_version='v1',
        updated_at=now()
    where id=v_order.id;

    update public.order_command_pilot_orders
    set enabled=false,disabled_by=auth.uid(),disabled_at=now()
    where order_id=v_order.id and enabled=true;

    insert into public.order_events(order_id,type,message,new_status,metadata,created_by)
    values(v_order.id,'inventory_released','Reserva interna liberada pelo Order Command v1','released',
      jsonb_build_object('pilot',v_pilot_enabled,'pilot_closed',v_pilot_enabled,'reason',coalesce(_reason,'released')),auth.uid());

    return jsonb_build_object('ok',true,'order_id',v_order.id,'released_items',v_count,'pilot_closed',v_pilot_enabled);
  end if;

  raise exception 'Ação não processada';
end;
$function$;

revoke all on function public.admin_set_order_command_pilot(uuid,boolean,text) from public;
revoke all on function public.admin_set_order_command_pilot(uuid,boolean,text) from anon;
grant execute on function public.admin_set_order_command_pilot(uuid,boolean,text) to authenticated;
