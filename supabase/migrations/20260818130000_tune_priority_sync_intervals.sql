-- Stock freshness is handled by the incremental stock-delta endpoint every 15 minutes.
-- The targeted product lookup is therefore for price/metadata/list-code refresh and can
-- run much less frequently, saving Trier/SGF/API work.
create or replace view public.product_sync_priority
with (security_invoker = true)
as
with local_sales as (
  select oi.product_id,max(o.created_at) as last_sale_at,
    coalesce(sum(oi.quantity) filter (where o.created_at::date >= current_date-30),0)::bigint as units_30d,
    coalesce(sum(oi.quantity) filter (where o.created_at::date >= current_date-90),0)::bigint as units_90d,
    coalesce(sum(oi.quantity) filter (where o.created_at::date >= current_date-180),0)::bigint as units_180d,
    coalesce(sum(oi.quantity) filter (where o.created_at::date >= current_date-365),0)::bigint as units_365d
  from public.order_items oi
  join public.orders o on o.id=oi.order_id
  where oi.product_id is not null
    and o.payment_status='approved'
    and o.created_at::date >= current_date-365
    and coalesce(o.status,'') not in ('cancelado','cancelled','recusado','refused','reembolsado','refunded')
    and coalesce(o.order_status,'') not in ('cancelado','cancelled','recusado','refused')
  group by oi.product_id
), base as (
  select p.id as product_id,p.trier_product_id,p.name,
    greatest(coalesce(p.stock,0),coalesce(p.stock_quantity,0),coalesce(p.trier_stock_quantity,0)) as effective_stock,
    greatest(ls.last_sale_at,tr.last_sale_at) as last_sale_at,
    greatest(coalesce(ls.units_30d,0),coalesce(tr.units_30d,0))::bigint as units_30d,
    greatest(coalesce(ls.units_90d,0),coalesce(tr.units_90d,0))::bigint as units_90d,
    greatest(coalesce(ls.units_180d,0),coalesce(tr.units_180d,0))::bigint as units_180d,
    greatest(coalesce(ls.units_365d,0),coalesce(tr.units_365d,0))::bigint as units_365d,
    p.active,p.manual_disabled,p.archived_at,p.last_trier_sync_at
  from public.products p
  left join local_sales ls on ls.product_id=p.id
  left join public.trier_product_rotation tr on tr.trier_product_id=p.trier_product_id
  where p.trier_product_id is not null
)
select b.*,
  case
    when b.effective_stock>0 or b.last_sale_at::date>=current_date-30 then 1
    when b.last_sale_at::date>=current_date-90 then 2
    when b.last_sale_at::date>=current_date-180 then 3
    when b.last_sale_at::date>=current_date-365 then 4
    else 5
  end as priority_tier,
  case
    when b.effective_stock>0 or b.last_sale_at::date>=current_date-30 then 720
    when b.last_sale_at::date>=current_date-90 then 1440
    when b.last_sale_at::date>=current_date-180 then 10080
    when b.last_sale_at::date>=current_date-365 then 43200
    else null
  end as sync_interval_minutes,
  case
    when b.effective_stock>0 then 'estoque_positivo'
    when b.last_sale_at::date>=current_date-30 then 'giro_30d'
    when b.last_sale_at::date>=current_date-90 then 'giro_90d'
    when b.last_sale_at::date>=current_date-180 then 'giro_180d'
    when b.last_sale_at::date>=current_date-365 then 'giro_365d'
    else 'sem_giro_conhecido'
  end as priority_reason,
  case
    when b.effective_stock>0 or b.last_sale_at::date>=current_date-30 then coalesce(b.last_trier_sync_at,'epoch'::timestamptz)+interval '12 hours'
    when b.last_sale_at::date>=current_date-90 then coalesce(b.last_trier_sync_at,'epoch'::timestamptz)+interval '1 day'
    when b.last_sale_at::date>=current_date-180 then coalesce(b.last_trier_sync_at,'epoch'::timestamptz)+interval '7 days'
    when b.last_sale_at::date>=current_date-365 then coalesce(b.last_trier_sync_at,'epoch'::timestamptz)+interval '30 days'
    else null
  end as next_sync_at
from base b;
grant select on public.product_sync_priority to authenticated,service_role;
