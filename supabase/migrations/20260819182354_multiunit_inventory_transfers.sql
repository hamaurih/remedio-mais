-- Multiunit Inventory Transfers
-- Transferência auditável entre matriz/filiais usando o ledger canônico.

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
create index if not exists inventory_transfers_source_idx
  on public.inventory_transfers(source_store_id,status,created_at desc);
create index if not exists inventory_transfers_destination_idx
  on public.inventory_transfers(destination_store_id,status,created_at desc);

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
create index if not exists inventory_transfer_items_transfer_idx
  on public.inventory_transfer_items(transfer_id);
create index if not exists inventory_transfer_items_product_idx
  on public.inventory_transfer_items(product_id);

create or replace function public.dispatch_inventory_transfer_internal(
  _transfer_id uuid,
  _actor_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  t public.inventory_transfers%rowtype;
  i public.inventory_transfer_items%rowtype;
  v_count integer:=0;
begin
  select * into t from public.inventory_transfers where id=_transfer_id for update;
  if not found then raise exception 'Transferência não encontrada'; end if;
  if t.status='in_transit' then
    return jsonb_build_object('ok',true,'already_dispatched',true);
  end if;
  if t.status not in ('approved','draft') then
    raise exception 'Transferência não pode ser despachada no status %',t.status;
  end if;

  for i in
    select * from public.inventory_transfer_items
    where transfer_id=t.id order by created_at,id for update
  loop
    if not i.dispatched then
      insert into public.inventory_ledger(
        tenant_id,store_id,product_id,movement_type,on_hand_delta,reserved_delta,unit_cost,
        source_type,source_id,reference,idempotency_key,metadata,created_by
      ) values(
        t.tenant_id,t.source_store_id,i.product_id,'transfer_out',-i.quantity,0,i.unit_cost,
        'inventory_transfer',t.id::text,'Transferência entre unidades',
        'transfer-out:'||t.id::text||':'||i.id::text,
        jsonb_build_object(
          'destination_store_id',t.destination_store_id,
          'batch_number',i.batch_number,
          'expiry_date',i.expiry_date
        ),_actor_id
      ) on conflict do nothing;
      update public.inventory_transfer_items
      set dispatched=true,updated_at=now() where id=i.id;
      v_count:=v_count+1;
    end if;
  end loop;

  update public.inventory_transfers
  set status='in_transit',dispatched_by=_actor_id,dispatched_at=now(),updated_at=now()
  where id=t.id;
  return jsonb_build_object('ok',true,'dispatched_items',v_count);
end;
$$;
revoke all on function public.dispatch_inventory_transfer_internal(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.dispatch_inventory_transfer_internal(uuid,uuid)
  to service_role;

create or replace function public.receive_inventory_transfer_internal(
  _transfer_id uuid,
  _actor_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  t public.inventory_transfers%rowtype;
  i public.inventory_transfer_items%rowtype;
  v_count integer:=0;
  v_lot uuid;
begin
  select * into t from public.inventory_transfers where id=_transfer_id for update;
  if not found then raise exception 'Transferência não encontrada'; end if;
  if t.status='received' then
    return jsonb_build_object('ok',true,'already_received',true);
  end if;
  if t.status<>'in_transit' then
    raise exception 'Transferência ainda não está em trânsito';
  end if;

  for i in
    select * from public.inventory_transfer_items
    where transfer_id=t.id order by created_at,id for update
  loop
    if not i.received then
      v_lot:=null;
      if nullif(trim(coalesce(i.batch_number,'')),'') is not null then
        select il.id into v_lot
        from public.inventory_lots il
        where il.tenant_id=t.tenant_id
          and il.store_id=t.destination_store_id
          and il.product_id=i.product_id
          and il.batch_number=i.batch_number
          and il.expiry_date is not distinct from i.expiry_date
        limit 1;
        if v_lot is null then
          insert into public.inventory_lots(
            tenant_id,store_id,product_id,batch_number,expiry_date,unit_cost,metadata
          ) values(
            t.tenant_id,t.destination_store_id,i.product_id,i.batch_number,
            i.expiry_date,i.unit_cost,
            jsonb_build_object('source','inventory_transfer','transfer_id',t.id)
          ) returning id into v_lot;
        end if;
      end if;

      insert into public.inventory_ledger(
        tenant_id,store_id,product_id,lot_id,movement_type,on_hand_delta,reserved_delta,
        unit_cost,source_type,source_id,reference,idempotency_key,metadata,created_by
      ) values(
        t.tenant_id,t.destination_store_id,i.product_id,v_lot,'transfer_in',i.quantity,0,
        i.unit_cost,'inventory_transfer',t.id::text,'Transferência recebida',
        'transfer-in:'||t.id::text||':'||i.id::text,
        jsonb_build_object(
          'source_store_id',t.source_store_id,
          'batch_number',i.batch_number,
          'expiry_date',i.expiry_date
        ),_actor_id
      ) on conflict do nothing;
      update public.inventory_transfer_items
      set received=true,updated_at=now() where id=i.id;
      v_count:=v_count+1;
    end if;
  end loop;

  update public.inventory_transfers
  set status='received',received_by=_actor_id,received_at=now(),updated_at=now()
  where id=t.id;
  return jsonb_build_object('ok',true,'received_items',v_count);
end;
$$;
revoke all on function public.receive_inventory_transfer_internal(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.receive_inventory_transfer_internal(uuid,uuid)
  to service_role;

alter table public.inventory_transfers enable row level security;
alter table public.inventory_transfer_items enable row level security;

create policy inventory_transfers_member_read on public.inventory_transfers
for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));
create policy inventory_transfers_manage on public.inventory_transfers
for all to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']))
with check(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']));

create policy inventory_transfer_items_member_read on public.inventory_transfer_items
for select to authenticated using(exists(
  select 1 from public.inventory_transfers t
  where t.id=inventory_transfer_items.transfer_id
    and private.is_tenant_member(t.tenant_id,auth.uid())
));
create policy inventory_transfer_items_manage on public.inventory_transfer_items
for all to authenticated using(exists(
  select 1 from public.inventory_transfers t
  where t.id=inventory_transfer_items.transfer_id
    and private.has_tenant_role(t.tenant_id,auth.uid(),array['owner','admin','manager','inventory'])
))
with check(exists(
  select 1 from public.inventory_transfers t
  where t.id=inventory_transfer_items.transfer_id
    and private.has_tenant_role(t.tenant_id,auth.uid(),array['owner','admin','manager','inventory'])
));
