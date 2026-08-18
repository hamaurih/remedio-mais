-- Pharmacy Purchasing + Receiving
-- Own supplier, purchase, receiving, lot/expiry and cost flow.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legal_name text not null,
  trade_name text null,
  cnpj text null,
  state_registration text null,
  contact_name text null,
  email text null,
  phone text null,
  address jsonb not null default '{}'::jsonb,
  payment_terms text null,
  lead_time_days integer null check(lead_time_days is null or lead_time_days>=0),
  active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists suppliers_tenant_cnpj_uq
  on public.suppliers(tenant_id,cnpj) where cnpj is not null;
create index if not exists suppliers_tenant_active_idx on public.suppliers(tenant_id,active,trade_name);

create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_sku text null,
  supplier_barcode text null,
  last_cost numeric(14,4) null check(last_cost is null or last_cost>=0),
  minimum_order_qty numeric(14,3) null check(minimum_order_qty is null or minimum_order_qty>=0),
  preferred boolean not null default false,
  last_purchase_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,supplier_id,product_id)
);
create index if not exists supplier_products_product_idx on public.supplier_products(tenant_id,product_id,preferred desc);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  number bigint generated always as identity,
  status text not null default 'draft'
    check(status in ('draft','approved','sent','partially_received','received','cancelled')),
  ordered_at timestamptz null,
  expected_at timestamptz null,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  freight numeric(14,2) not null default 0,
  taxes numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  buyer_id uuid null references auth.users(id),
  approved_by uuid null references auth.users(id),
  approved_at timestamptz null,
  notes text null,
  external_reference text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchase_orders_status_idx on public.purchase_orders(tenant_id,store_id,status,created_at desc);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders(tenant_id,supplier_id,created_at desc);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity_ordered numeric(14,3) not null check(quantity_ordered>0),
  quantity_received numeric(14,3) not null default 0 check(quantity_received>=0),
  unit_cost numeric(14,4) not null default 0 check(unit_cost>=0),
  discount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchase_order_items_order_idx on public.purchase_order_items(purchase_order_id);
create index if not exists purchase_order_items_product_idx on public.purchase_order_items(product_id);

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_order_id uuid null references public.purchase_orders(id) on delete restrict,
  status text not null default 'draft'
    check(status in ('draft','checked','posted','cancelled')),
  supplier_invoice_model text null,
  supplier_invoice_series text null,
  supplier_invoice_number text null,
  supplier_invoice_access_key text null,
  supplier_invoice_issued_at timestamptz null,
  received_at timestamptz not null default now(),
  received_by uuid null references auth.users(id),
  checked_by uuid null references auth.users(id),
  checked_at timestamptz null,
  posted_by uuid null references auth.users(id),
  posted_at timestamptz null,
  total_cost numeric(14,2) not null default 0,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists goods_receipts_invoice_key_uq
  on public.goods_receipts(tenant_id,supplier_invoice_access_key)
  where supplier_invoice_access_key is not null;
create index if not exists goods_receipts_status_idx on public.goods_receipts(tenant_id,store_id,status,received_at desc);

create table if not exists public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references public.goods_receipts(id) on delete cascade,
  purchase_order_item_id uuid null references public.purchase_order_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check(quantity>0),
  unit_cost numeric(14,4) not null default 0 check(unit_cost>=0),
  batch_number text null,
  manufacture_date date null,
  expiry_date date null,
  lot_id uuid null references public.inventory_lots(id) on delete restrict,
  posted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goods_receipt_items_receipt_idx on public.goods_receipt_items(goods_receipt_id);
create index if not exists goods_receipt_items_product_idx on public.goods_receipt_items(product_id);

-- Totals are recomputed server-side; UI values are never authoritative.
create or replace function private.recalculate_purchase_order(_purchase_order_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_subtotal numeric; v_total numeric;
begin
  select coalesce(sum(quantity_ordered*unit_cost-discount+tax_amount),0)
  into v_subtotal
  from public.purchase_order_items where purchase_order_id=_purchase_order_id;

  update public.purchase_orders po
  set subtotal=v_subtotal,
      total=greatest(v_subtotal-po.discount+po.freight+po.taxes,0),
      updated_at=now()
  where po.id=_purchase_order_id;
end;
$$;
revoke all on function private.recalculate_purchase_order(uuid) from public,anon,authenticated;

create or replace function private.purchase_item_recalculate_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_order_id uuid;
begin
  v_order_id:=coalesce(new.purchase_order_id,old.purchase_order_id);
  perform private.recalculate_purchase_order(v_order_id);
  return coalesce(new,old);
end;
$$;
revoke all on function private.purchase_item_recalculate_trigger() from public,anon,authenticated;
create trigger trg_purchase_items_recalculate
after insert or update or delete on public.purchase_order_items
for each row execute function private.purchase_item_recalculate_trigger();

-- Atomic server-only stock posting. Idempotency is guaranteed by inventory_ledger keys.
create or replace function public.post_goods_receipt_internal(_receipt_id uuid,_actor_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  r public.goods_receipts%rowtype;
  i public.goods_receipt_items%rowtype;
  v_lot_id uuid;
  v_total numeric:=0;
  v_remaining integer:=0;
begin
  select * into r from public.goods_receipts where id=_receipt_id for update;
  if not found then raise exception 'Recebimento não encontrado'; end if;
  if r.status='posted' then return jsonb_build_object('ok',true,'already_posted',true,'receipt_id',r.id); end if;
  if r.status='cancelled' then raise exception 'Recebimento cancelado'; end if;

  for i in select * from public.goods_receipt_items where goods_receipt_id=r.id order by created_at,id for update loop
    if not i.posted then
      v_lot_id:=null;
      if nullif(trim(coalesce(i.batch_number,'')),'') is not null then
        select il.id into v_lot_id
        from public.inventory_lots il
        where il.tenant_id=r.tenant_id and il.store_id=r.store_id and il.product_id=i.product_id
          and il.batch_number=i.batch_number
          and il.expiry_date is not distinct from i.expiry_date
        limit 1;

        if v_lot_id is null then
          insert into public.inventory_lots(
            tenant_id,store_id,product_id,batch_number,manufacture_date,expiry_date,unit_cost,supplier_reference,metadata
          ) values(
            r.tenant_id,r.store_id,i.product_id,i.batch_number,i.manufacture_date,i.expiry_date,i.unit_cost,
            r.supplier_invoice_access_key,
            jsonb_build_object('goods_receipt_id',r.id,'supplier_id',r.supplier_id)
          ) returning id into v_lot_id;
        end if;
      end if;

      insert into public.inventory_ledger(
        tenant_id,store_id,product_id,lot_id,movement_type,on_hand_delta,reserved_delta,unit_cost,
        source_type,source_id,reference,idempotency_key,metadata,created_by
      ) values(
        r.tenant_id,r.store_id,i.product_id,v_lot_id,'purchase',i.quantity,0,i.unit_cost,
        'goods_receipt',r.id::text,r.supplier_invoice_access_key,
        'goods_receipt:'||r.id::text||':item:'||i.id::text,
        jsonb_build_object('supplier_id',r.supplier_id,'purchase_order_id',r.purchase_order_id),_actor_id
      ) on conflict do nothing;

      update public.goods_receipt_items set posted=true,lot_id=v_lot_id,updated_at=now() where id=i.id;
      if i.purchase_order_item_id is not null then
        update public.purchase_order_items
        set quantity_received=quantity_received+i.quantity,updated_at=now()
        where id=i.purchase_order_item_id;
      end if;
      v_total:=v_total+(i.quantity*i.unit_cost);

      insert into public.supplier_products(tenant_id,supplier_id,product_id,last_cost,last_purchase_at)
      values(r.tenant_id,r.supplier_id,i.product_id,i.unit_cost,now())
      on conflict(tenant_id,supplier_id,product_id)
      do update set last_cost=excluded.last_cost,last_purchase_at=excluded.last_purchase_at,updated_at=now();
    end if;
  end loop;

  update public.goods_receipts
  set status='posted',posted_by=_actor_id,posted_at=now(),total_cost=v_total,updated_at=now()
  where id=r.id;

  if r.purchase_order_id is not null then
    select count(*) into v_remaining
    from public.purchase_order_items poi
    where poi.purchase_order_id=r.purchase_order_id
      and poi.quantity_received < poi.quantity_ordered;

    update public.purchase_orders
    set status=case when v_remaining=0 then 'received' else 'partially_received' end,updated_at=now()
    where id=r.purchase_order_id and status<>'cancelled';
  end if;

  return jsonb_build_object('ok',true,'receipt_id',r.id,'total_cost',v_total);
end;
$$;
revoke all on function public.post_goods_receipt_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.post_goods_receipt_internal(uuid,uuid) to service_role;

-- RLS
alter table public.suppliers enable row level security;
alter table public.supplier_products enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_items enable row level security;

create policy suppliers_member_read on public.suppliers for select to authenticated
using(private.is_tenant_member(tenant_id,auth.uid()));
create policy supplier_products_member_read on public.supplier_products for select to authenticated
using(private.is_tenant_member(tenant_id,auth.uid()));
create policy purchase_orders_member_read on public.purchase_orders for select to authenticated
using(private.is_tenant_member(tenant_id,auth.uid()));
create policy purchase_order_items_member_read on public.purchase_order_items for select to authenticated
using(exists(select 1 from public.purchase_orders po where po.id=purchase_order_items.purchase_order_id and private.is_tenant_member(po.tenant_id,auth.uid())));
create policy goods_receipts_member_read on public.goods_receipts for select to authenticated
using(private.is_tenant_member(tenant_id,auth.uid()));
create policy goods_receipt_items_member_read on public.goods_receipt_items for select to authenticated
using(exists(select 1 from public.goods_receipts gr where gr.id=goods_receipt_items.goods_receipt_id and private.is_tenant_member(gr.tenant_id,auth.uid())));

-- Write permissions are intentionally narrower than read permissions.
create policy suppliers_manage on public.suppliers for all to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']))
with check(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']));
create policy supplier_products_manage on public.supplier_products for all to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']))
with check(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']));
create policy purchase_orders_manage on public.purchase_orders for all to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']))
with check(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']));
create policy purchase_order_items_manage on public.purchase_order_items for all to authenticated
using(exists(select 1 from public.purchase_orders po where po.id=purchase_order_items.purchase_order_id and private.has_tenant_role(po.tenant_id,auth.uid(),array['owner','admin','manager','inventory'])))
with check(exists(select 1 from public.purchase_orders po where po.id=purchase_order_items.purchase_order_id and private.has_tenant_role(po.tenant_id,auth.uid(),array['owner','admin','manager','inventory'])));
create policy goods_receipts_manage on public.goods_receipts for all to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']))
with check(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']));
create policy goods_receipt_items_manage on public.goods_receipt_items for all to authenticated
using(exists(select 1 from public.goods_receipts gr where gr.id=goods_receipt_items.goods_receipt_id and private.has_tenant_role(gr.tenant_id,auth.uid(),array['owner','admin','manager','inventory'])))
with check(exists(select 1 from public.goods_receipts gr where gr.id=goods_receipt_items.goods_receipt_id and private.has_tenant_role(gr.tenant_id,auth.uid(),array['owner','admin','manager','inventory'])));

comment on table public.goods_receipts is 'Own receiving workflow: supplier invoice, conference, lots/expiry, costs and stock posting.';
comment on function public.post_goods_receipt_internal(uuid,uuid) is 'Service-role only atomic receipt posting into canonical inventory ledger.';
