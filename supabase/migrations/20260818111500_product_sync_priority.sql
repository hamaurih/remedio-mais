-- Priority model for recurring Trier synchronization.
-- Goal: spend API/database work only on products that matter operationally.
-- Tier 1: stock > 0 OR sale in last 30 days -> frequent sync
-- Tier 2: no stock, sale in last 90 days -> hourly
-- Tier 3: sale in last 180 days -> daily
-- Tier 4: sale in last 365 days -> weekly
-- Tier 5: no known rotation in 365 days -> no automatic sync

create table if not exists public.trier_product_rotation (
  trier_product_id text primary key,
  last_sale_at timestamptz,
  units_30d bigint not null default 0,
  units_90d bigint not null default 0,
  units_180d bigint not null default 0,
  units_365d bigint not null default 0,
  orders_90d bigint not null default 0,
  source text not null default 'trier',
  synced_at timestamptz not null default now()
);

alter table public.trier_product_rotation enable row level security;

drop policy if exists trier_product_rotation_admin_read on public.trier_product_rotation;
create policy trier_product_rotation_admin_read
on public.trier_product_rotation
for select to authenticated
using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'seller'));

grant select on public.trier_product_rotation to authenticated;
grant all on public.trier_product_rotation to service_role;

create index if not exists idx_trier_product_rotation_last_sale
  on public.trier_product_rotation(last_sale_at desc);

create or replace view public.product_sync_priority as
with local_sales as (
  select
    oi.product_id,
    max(o.created_at) as last_sale_at,
    coalesce(sum(oi.quantity) filter (where o.created_at >= now() - interval '30 days'),0)::bigint as units_30d,
    coalesce(sum(oi.quantity) filter (where o.created_at >= now() - interval '90 days'),0)::bigint as units_90d,
    coalesce(sum(oi.quantity) filter (where o.created_at >= now() - interval '180 days'),0)::bigint as units_180d,
    coalesce(sum(oi.quantity) filter (where o.created_at >= now() - interval '365 days'),0)::bigint as units_365d
  from public.order_items oi
  join public.orders o on o.id=oi.order_id
  where oi.product_id is not null
    and o.payment_status='approved'
    and o.created_at >= now() - interval '365 days'
    and coalesce(o.status,'') not in ('cancelado','cancelled','recusado','refused','reembolsado','refunded')
    and coalesce(o.order_status,'') not in ('cancelado','cancelled','recusado','refused')
  group by oi.product_id
), base as (
  select
    p.id as product_id,
    p.trier_product_id,
    p.name,
    greatest(coalesce(p.stock,0),coalesce(p.stock_quantity,0),coalesce(p.trier_stock_quantity,0)) as effective_stock,
    greatest(ls.last_sale_at,tr.last_sale_at) as last_sale_at,
    greatest(coalesce(ls.units_30d,0),coalesce(tr.units_30d,0))::bigint as units_30d,
    greatest(coalesce(ls.units_90d,0),coalesce(tr.units_90d,0))::bigint as units_90d,
    greatest(coalesce(ls.units_180d,0),coalesce(tr.units_180d,0))::bigint as units_180d,
    greatest(coalesce(ls.units_365d,0),coalesce(tr.units_365d,0))::bigint as units_365d,
    p.active,
    p.manual_disabled,
    p.archived_at,
    p.last_trier_sync_at
  from public.products p
  left join local_sales ls on ls.product_id=p.id
  left join public.trier_product_rotation tr on tr.trier_product_id=p.trier_product_id
  where p.trier_product_id is not null
)
select
  b.*,
  case
    when b.effective_stock > 0 or b.last_sale_at >= now() - interval '30 days' then 1
    when b.last_sale_at >= now() - interval '90 days' then 2
    when b.last_sale_at >= now() - interval '180 days' then 3
    when b.last_sale_at >= now() - interval '365 days' then 4
    else 5
  end as priority_tier,
  case
    when b.effective_stock > 0 or b.last_sale_at >= now() - interval '30 days' then 15
    when b.last_sale_at >= now() - interval '90 days' then 60
    when b.last_sale_at >= now() - interval '180 days' then 1440
    when b.last_sale_at >= now() - interval '365 days' then 10080
    else null
  end as sync_interval_minutes,
  case
    when b.effective_stock > 0 then 'estoque_positivo'
    when b.last_sale_at >= now() - interval '30 days' then 'giro_30d'
    when b.last_sale_at >= now() - interval '90 days' then 'giro_90d'
    when b.last_sale_at >= now() - interval '180 days' then 'giro_180d'
    when b.last_sale_at >= now() - interval '365 days' then 'giro_365d'
    else 'sem_giro_conhecido'
  end as priority_reason,
  case
    when b.effective_stock > 0 or b.last_sale_at >= now() - interval '30 days' then coalesce(b.last_trier_sync_at,'epoch'::timestamptz) + interval '15 minutes'
    when b.last_sale_at >= now() - interval '90 days' then coalesce(b.last_trier_sync_at,'epoch'::timestamptz) + interval '60 minutes'
    when b.last_sale_at >= now() - interval '180 days' then coalesce(b.last_trier_sync_at,'epoch'::timestamptz) + interval '1 day'
    when b.last_sale_at >= now() - interval '365 days' then coalesce(b.last_trier_sync_at,'epoch'::timestamptz) + interval '7 days'
    else null
  end as next_sync_at
from base b;

grant select on public.product_sync_priority to authenticated, service_role;
