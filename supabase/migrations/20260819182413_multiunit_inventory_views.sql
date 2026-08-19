-- Multiunit Inventory Views

create or replace view public.store_inventory_summary
with (security_invoker=true)
as
select
  s.tenant_id,
  s.id as store_id,
  s.name as store_name,
  s.code,
  s.store_type,
  s.is_headquarters,
  s.active,
  s.delivery_enabled,
  s.pickup_enabled,
  s.ecommerce_fulfillment_enabled,
  s.service_radius_km,
  s.fulfillment_priority,
  s.preparation_minutes,
  count(ib.product_id)::bigint as catalog_items,
  count(*) filter(where ib.on_hand>0)::bigint as items_with_stock,
  count(*) filter(where ib.available<=coalesce(ib.minimum_stock,0))::bigint as low_stock_items,
  coalesce(sum(ib.on_hand),0)::numeric as total_units,
  coalesce(sum(ib.reserved),0)::numeric as reserved_units,
  coalesce(sum(ib.available),0)::numeric as available_units
from public.stores s
left join public.inventory_balances ib
  on ib.tenant_id=s.tenant_id and ib.store_id=s.id
group by
  s.tenant_id,s.id,s.name,s.code,s.store_type,s.is_headquarters,s.active,
  s.delivery_enabled,s.pickup_enabled,s.ecommerce_fulfillment_enabled,
  s.service_radius_km,s.fulfillment_priority,s.preparation_minutes;

grant select on public.store_inventory_summary to authenticated;

create or replace view public.store_inventory_catalog
with (security_invoker=true)
as
select
  ib.tenant_id,
  ib.store_id,
  s.name as store_name,
  ib.product_id,
  p.name as product_name,
  p.sku,
  p.barcode,
  p.image_url,
  ib.on_hand,
  ib.reserved,
  ib.available,
  ib.minimum_stock,
  ib.updated_at
from public.inventory_balances ib
join public.stores s
  on s.id=ib.store_id and s.tenant_id=ib.tenant_id
join public.products p on p.id=ib.product_id;

grant select on public.store_inventory_catalog to authenticated;

comment on function public.get_fulfillment_candidates(uuid,jsonb,numeric,numeric,text)
  is 'Ranks eligible stores for an ecommerce cart. Server-side only to avoid exposing cross-store availability.';
comment on table public.order_inventory_reservations
  is 'Per-store stock reservations that prevent overselling while an ecommerce order awaits payment.';
comment on table public.inventory_transfers
  is 'Auditable inventory transfer workflow between matrix and branches.';
