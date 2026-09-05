create or replace function public.admin_replenishment_recommendations(
  _target_days integer default 14,
  _critical_days integer default 7,
  _limit integer default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant_id uuid;
  v_store_id uuid;
  v_store_name text;
  v_target_days integer := least(greatest(coalesce(_target_days, 14), 7), 60);
  v_critical_days integer := least(greatest(coalesce(_critical_days, 7), 1), 30);
  v_limit integer := least(greatest(coalesce(_limit, 300), 1), 1000);
  v_result jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Apenas administradores podem consultar reposição inteligente';
  end if;

  select tm.tenant_id,
         coalesce(tm.store_id, s.id),
         coalesce(s.name, 'Unidade principal')
    into v_tenant_id, v_store_id, v_store_name
  from public.tenant_memberships tm
  left join lateral (
    select st.id, st.name
      from public.stores st
     where st.tenant_id = tm.tenant_id
       and st.active = true
     order by st.is_headquarters desc nulls last, st.created_at asc
     limit 1
  ) s on true
  where tm.user_id = auth.uid()
    and tm.active = true
  order by case when tm.role::text in ('owner','admin') then 0 else 1 end, tm.created_at asc
  limit 1;

  if v_tenant_id is null or v_store_id is null then
    raise exception 'Administrador sem vínculo ativo com uma unidade';
  end if;

  with base as (
    select
      p.id as product_id,
      p.name as product_name,
      p.trier_product_id,
      p.sku,
      p.barcode,
      p.image_url,
      p.category_name,
      p.department_name,
      p.laboratory,
      p.requires_prescription,
      p.controlled,
      coalesce(ib.available, p.stock::numeric, 0::numeric) as available_stock,
      coalesce(ib.on_hand, p.stock::numeric, 0::numeric) as on_hand_stock,
      coalesce(ib.reserved, 0::numeric) as reserved_stock,
      coalesce(ib.minimum_stock, p.minimum_stock::numeric, 0::numeric) as minimum_stock,
      coalesce(r.units_30d, 0)::numeric as units_30d,
      coalesce(r.units_90d, 0)::numeric as units_90d,
      r.last_sale_at,
      r.synced_at,
      case
        when coalesce(r.units_30d, 0) > 0 then r.units_30d::numeric / 30.0
        when coalesce(r.units_90d, 0) > 0 then r.units_90d::numeric / 90.0
        else 0::numeric
      end as avg_daily_units,
      sup.supplier_id,
      sup.supplier_name,
      sup.last_cost,
      sup.minimum_order_qty
    from public.products p
    join public.trier_product_rotation r
      on r.trier_product_id = p.trier_product_id
    left join public.inventory_balances ib
      on ib.tenant_id = v_tenant_id
     and ib.store_id = v_store_id
     and ib.product_id = p.id
    left join lateral (
      select
        sp.supplier_id,
        coalesce(nullif(s.trade_name, ''), s.legal_name) as supplier_name,
        sp.last_cost,
        sp.minimum_order_qty
      from public.supplier_products sp
      join public.suppliers s on s.id = sp.supplier_id
      where sp.tenant_id = v_tenant_id
        and sp.product_id = p.id
        and s.active = true
      order by sp.preferred desc, sp.last_purchase_at desc nulls last, sp.updated_at desc
      limit 1
    ) sup on true
    where p.archived_at is null
      and p.mapping_status = 'mapped'
      and coalesce(p.trier_active, true) = true
      and (coalesce(r.units_30d, 0) > 0 or coalesce(r.units_90d, 0) > 0)
  ), scored as (
    select
      b.*,
      case when b.avg_daily_units > 0 then round(b.available_stock / b.avg_daily_units, 1) else null end as coverage_days,
      greatest(
        0::numeric,
        ceil(b.avg_daily_units * v_target_days - b.available_stock),
        ceil(b.minimum_stock - b.available_stock)
      )::integer as raw_suggested_qty
    from base b
  ), normalized as (
    select
      s.*,
      case
        when s.raw_suggested_qty <= 0 then 0
        when coalesce(s.minimum_order_qty, 0) > 1 then
          (ceil(s.raw_suggested_qty::numeric / s.minimum_order_qty) * s.minimum_order_qty)::integer
        else s.raw_suggested_qty
      end as suggested_qty,
      case
        when s.available_stock <= 0 and s.avg_daily_units > 0 then 'ruptura'
        when s.avg_daily_units > 0 and (s.available_stock / s.avg_daily_units) <= v_critical_days then 'critico'
        when s.available_stock <= s.minimum_stock then 'estoque_baixo'
        when s.avg_daily_units > 0 and (s.available_stock / s.avg_daily_units) < v_target_days then 'repor'
        else 'ok'
      end as priority
    from scored s
  ), candidates as (
    select *
      from normalized
     where suggested_qty > 0
        or priority in ('ruptura','critico','estoque_baixo')
  ), ordered as (
    select c.*,
           case c.priority
             when 'ruptura' then 1
             when 'critico' then 2
             when 'estoque_baixo' then 3
             when 'repor' then 4
             else 5
           end as priority_rank
      from candidates c
  ), limited_rows as (
    select *
      from ordered
     order by priority_rank asc, coverage_days asc nulls last, units_30d desc, product_name asc
     limit v_limit
  )
  select jsonb_build_object(
    'store', jsonb_build_object('id', v_store_id, 'name', v_store_name),
    'parameters', jsonb_build_object('target_days', v_target_days, 'critical_days', v_critical_days),
    'freshness', jsonb_build_object(
      'rotation_synced_at', (select max(synced_at) from base),
      'latest_sale_at', (select max(last_sale_at) from base)
    ),
    'summary', jsonb_build_object(
      'rupture_count', (select count(*) from candidates where priority = 'ruptura'),
      'critical_count', (select count(*) from candidates where priority = 'critico'),
      'low_stock_count', (select count(*) from candidates where priority = 'estoque_baixo'),
      'replenishment_count', (select count(*) from candidates),
      'suggested_units', (select coalesce(sum(suggested_qty), 0) from candidates),
      'estimated_cost', (select round(coalesce(sum(case when last_cost is not null then last_cost * suggested_qty else 0 end), 0), 2) from candidates),
      'costed_items', (select count(*) from candidates where last_cost is not null),
      'supplier_linked_items', (select count(*) from candidates where supplier_id is not null)
    ),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', product_id,
        'product_name', product_name,
        'trier_product_id', trier_product_id,
        'sku', sku,
        'barcode', barcode,
        'image_url', image_url,
        'category_name', category_name,
        'department_name', department_name,
        'laboratory', laboratory,
        'requires_prescription', requires_prescription,
        'controlled', controlled,
        'available_stock', available_stock,
        'on_hand_stock', on_hand_stock,
        'reserved_stock', reserved_stock,
        'minimum_stock', minimum_stock,
        'units_30d', units_30d,
        'units_90d', units_90d,
        'avg_daily_units', round(avg_daily_units, 2),
        'coverage_days', coverage_days,
        'last_sale_at', last_sale_at,
        'priority', priority,
        'suggested_qty', suggested_qty,
        'supplier_id', supplier_id,
        'supplier_name', supplier_name,
        'last_cost', last_cost,
        'minimum_order_qty', minimum_order_qty,
        'estimated_line_cost', case when last_cost is not null then round(last_cost * suggested_qty, 2) else null end
      ) order by priority_rank asc, coverage_days asc nulls last, units_30d desc, product_name asc)
      from limited_rows
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.admin_replenishment_recommendations(integer, integer, integer) from public;
revoke all on function public.admin_replenishment_recommendations(integer, integer, integer) from anon;
grant execute on function public.admin_replenishment_recommendations(integer, integer, integer) to authenticated;
