create or replace function public.admin_inventory_management(
  _abc_days integer default 90,
  _limit integer default 1000
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
  v_abc_days integer := case when coalesce(_abc_days, 90) in (30, 90, 180, 365) then coalesce(_abc_days, 90) else 90 end;
  v_limit integer := least(greatest(coalesce(_limit, 1000), 1), 2000);
  v_result jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Apenas administradores podem consultar a gestão inteligente de estoque';
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
      p.category_name,
      p.department_name,
      p.laboratory,
      p.requires_prescription,
      p.controlled,
      coalesce(ib.on_hand, p.stock::numeric, 0::numeric) as on_hand_stock,
      coalesce(ib.reserved, 0::numeric) as reserved_stock,
      coalesce(ib.available, p.stock::numeric, 0::numeric) as available_stock,
      coalesce(ib.minimum_stock, p.minimum_stock::numeric, 0::numeric) as minimum_stock,
      coalesce(r.units_30d, 0)::numeric as units_30d,
      coalesce(r.units_90d, 0)::numeric as units_90d,
      coalesce(r.units_180d, 0)::numeric as units_180d,
      coalesce(r.units_365d, 0)::numeric as units_365d,
      r.last_sale_at,
      r.synced_at,
      coalesce(
        nullif(p.price_base, 0),
        nullif(p.price, 0),
        nullif(p.site_price, 0),
        0
      )::numeric as reference_price,
      sup.supplier_id,
      sup.supplier_name,
      sup.last_cost,
      sup.minimum_order_qty,
      sup.lead_time_days,
      coalesce(sup.lead_time_days, 3) as effective_lead_time_days,
      case when sup.lead_time_days is null then 'default' else 'supplier' end as lead_time_source
    from public.products p
    left join public.trier_product_rotation r
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
        sp.minimum_order_qty,
        s.lead_time_days
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
      and (
        coalesce(r.units_365d, 0) > 0
        or coalesce(ib.on_hand, p.stock::numeric, 0::numeric) > 0
      )
  ), demand as (
    select
      b.*,
      case
        when b.units_30d > 0 and b.units_90d > 0 then
          (b.units_30d / 30.0) * 0.7 + (b.units_90d / 90.0) * 0.3
        when b.units_30d > 0 then b.units_30d / 30.0
        when b.units_90d > 0 then b.units_90d / 90.0
        else 0::numeric
      end as avg_daily_units,
      case v_abc_days
        when 30 then b.units_30d
        when 180 then b.units_180d
        when 365 then b.units_365d
        else b.units_90d
      end as abc_units
    from base b
  ), valued as (
    select
      d.*,
      (d.abc_units * d.reference_price) as abc_value,
      sum(d.abc_units * d.reference_price) over () as total_abc_value
    from demand d
  ), ranked as (
    select
      v.*,
      sum(v.abc_value) over (
        order by v.abc_value desc, v.product_name asc
        rows between unbounded preceding and 1 preceding
      ) as abc_value_before
    from valued v
  ), classified as (
    select
      r.*,
      case
        when coalesce(r.total_abc_value, 0) <= 0 then 'C'
        when (coalesce(r.abc_value_before, 0) / r.total_abc_value) * 100 < 80 then 'A'
        when (coalesce(r.abc_value_before, 0) / r.total_abc_value) * 100 < 95 then 'B'
        else 'C'
      end as abc_class
    from ranked r
  ), policy as (
    select
      c.*,
      case c.abc_class
        when 'A' then 7
        when 'B' then 5
        when 'C' then 3
        else 3
      end as safety_days,
      case c.abc_class
        when 'A' then 21
        when 'B' then 14
        when 'C' then 7
        else 7
      end as target_coverage_days
    from classified c
  ), thresholds as (
    select
      p.*,
      case
        when p.avg_daily_units > 0 then round(p.available_stock / p.avg_daily_units, 1)
        else null
      end as coverage_days,
      case
        when p.avg_daily_units > 0 then greatest(
          p.minimum_stock,
          ceil(p.avg_daily_units * (p.effective_lead_time_days + p.safety_days))
        )
        else p.minimum_stock
      end::numeric as reorder_point
    from policy p
  ), targets as (
    select
      t.*,
      case
        when t.avg_daily_units > 0 then greatest(
          t.reorder_point,
          ceil(t.avg_daily_units * (
            t.effective_lead_time_days + t.safety_days + t.target_coverage_days
          ))
        )
        else t.minimum_stock
      end::numeric as target_stock
    from thresholds t
  ), statused as (
    select
      t.*,
      case
        when t.avg_daily_units <= 0 and t.available_stock > 0 then 'sem_giro'
        when t.avg_daily_units > 0 and t.available_stock <= 0 then 'ruptura'
        when t.avg_daily_units > 0 and t.available_stock <= t.reorder_point then 'critico'
        when t.avg_daily_units > 0 and t.available_stock < t.target_stock then 'repor'
        when t.avg_daily_units > 0 and t.target_stock > 0 and t.available_stock > t.target_stock * 2 then 'excesso'
        else 'ok'
      end as status,
      case
        when t.avg_daily_units <= 0 then 0
        else greatest(0, ceil(t.target_stock - t.available_stock))::integer
      end as raw_suggested_qty
    from targets t
  ), normalized as (
    select
      s.*,
      case
        when s.raw_suggested_qty <= 0 then 0
        when coalesce(s.minimum_order_qty, 0) > 1 then
          (ceil(s.raw_suggested_qty::numeric / s.minimum_order_qty) * s.minimum_order_qty)::integer
        else s.raw_suggested_qty
      end as suggested_qty,
      case s.status
        when 'ruptura' then 1
        when 'critico' then 2
        when 'repor' then 3
        when 'excesso' then 4
        when 'sem_giro' then 5
        else 6
      end as status_rank
    from statused s
  ), limited_rows as (
    select *
      from normalized
     order by status_rank asc, abc_class asc, coverage_days asc nulls last, abc_value desc, product_name asc
     limit v_limit
  )
  select jsonb_build_object(
    'store', jsonb_build_object('id', v_store_id, 'name', v_store_name),
    'parameters', jsonb_build_object(
      'abc_days', v_abc_days,
      'default_lead_time_days', 3,
      'excess_factor', 2,
      'class_policy', jsonb_build_object(
        'A', jsonb_build_object('safety_days', 7, 'coverage_days', 21),
        'B', jsonb_build_object('safety_days', 5, 'coverage_days', 14),
        'C', jsonb_build_object('safety_days', 3, 'coverage_days', 7)
      )
    ),
    'freshness', jsonb_build_object(
      'rotation_synced_at', (select max(synced_at) from base),
      'latest_sale_at', (select max(last_sale_at) from base)
    ),
    'summary', jsonb_build_object(
      'rupture_count', (select count(*) from normalized where status = 'ruptura'),
      'critical_count', (select count(*) from normalized where status = 'critico'),
      'replenishment_count', (select count(*) from normalized where suggested_qty > 0),
      'excess_count', (select count(*) from normalized where status = 'excesso'),
      'no_rotation_count', (select count(*) from normalized where status = 'sem_giro'),
      'ok_count', (select count(*) from normalized where status = 'ok'),
      'suggested_units', (select coalesce(sum(suggested_qty), 0) from normalized),
      'estimated_cost', (
        select round(coalesce(sum(case when last_cost is not null then last_cost * suggested_qty else 0 end), 0), 2)
        from normalized
      ),
      'supplier_linked_items', (select count(*) from normalized where supplier_id is not null),
      'lead_time_configured_items', (select count(*) from normalized where lead_time_source = 'supplier'),
      'abc_a_count', (select count(*) from normalized where abc_class = 'A'),
      'abc_b_count', (select count(*) from normalized where abc_class = 'B'),
      'abc_c_count', (select count(*) from normalized where abc_class = 'C')
    ),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', product_id,
        'product_name', product_name,
        'trier_product_id', trier_product_id,
        'sku', sku,
        'barcode', barcode,
        'category_name', category_name,
        'department_name', department_name,
        'laboratory', laboratory,
        'requires_prescription', requires_prescription,
        'controlled', controlled,
        'abc_class', abc_class,
        'abc_value', round(abc_value, 2),
        'abc_units', abc_units,
        'reference_price', reference_price,
        'on_hand_stock', on_hand_stock,
        'reserved_stock', reserved_stock,
        'available_stock', available_stock,
        'minimum_stock', minimum_stock,
        'units_30d', units_30d,
        'units_90d', units_90d,
        'units_180d', units_180d,
        'units_365d', units_365d,
        'avg_daily_units', round(avg_daily_units, 4),
        'coverage_days', coverage_days,
        'lead_time_days', effective_lead_time_days,
        'lead_time_source', lead_time_source,
        'safety_days', safety_days,
        'target_coverage_days', target_coverage_days,
        'reorder_point', reorder_point,
        'target_stock', target_stock,
        'status', status,
        'suggested_qty', suggested_qty,
        'last_sale_at', last_sale_at,
        'supplier_id', supplier_id,
        'supplier_name', supplier_name,
        'last_cost', last_cost,
        'minimum_order_qty', minimum_order_qty,
        'estimated_line_cost', case
          when last_cost is not null then round(last_cost * suggested_qty, 2)
          else null
        end
      ) order by status_rank asc, abc_class asc, coverage_days asc nulls last, abc_value desc, product_name asc)
      from limited_rows
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.admin_inventory_management(integer, integer) from public;
revoke all on function public.admin_inventory_management(integer, integer) from anon;
grant execute on function public.admin_inventory_management(integer, integer) to authenticated;
