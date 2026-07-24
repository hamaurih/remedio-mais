CREATE OR REPLACE FUNCTION public.admin_products_list(_search text DEFAULT NULL::text, _category_id uuid DEFAULT NULL::uuid, _manufacturer text DEFAULT NULL::text, _status text DEFAULT 'all'::text, _page integer DEFAULT 1, _page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_page integer := greatest(coalesce(_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(_page_size, 50), 1), 200);
  v_offset integer;
  v_result jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Apenas admin pode consultar produtos completos';
  end if;

  v_offset := (v_page - 1) * v_page_size;

  with filtered as (
    select p.*, c.name as category_display_name
    from public.products p
    left join public.categories c on c.id = p.category_id
    where (_search is null or _search = '' or p.name ilike ('%' || _search || '%'))
      and (_category_id is null or p.category_id = _category_id)
      and (_manufacturer is null or _manufacturer = '' or p.manufacturer = _manufacturer)
      and (
        coalesce(_status, 'all') = 'all'
        or (coalesce(_status, 'all') = 'active' and p.active = true)
        or (coalesce(_status, 'all') = 'inactive' and p.active = false)
        or (coalesce(_status, 'all') = 'sale' and p.promo_price is not null)
        or (coalesce(_status, 'all') = 'low' and p.stock <= coalesce(p.minimum_stock, 5))
        or (coalesce(_status, 'all') = 'stock_inactive' and p.active = false and p.stock > 0)
        or (coalesce(_status, 'all') = 'no_barcode_stock' and (p.barcode is null or p.barcode = '') and p.stock > 0)
        or (coalesce(_status, 'all') = 'no_image_stock' and (p.image_url is null or p.image_url = '' or p.image_url ilike '%placeholder%') and p.stock > 0)
      )
  ), counted as (
    select count(*)::integer as total_count from filtered
  ), paged as (
    select *
    from filtered
    order by updated_at desc nulls last, name asc
    limit v_page_size offset v_offset
  )
  select jsonb_build_object(
    'total', (select total_count from counted),
    'page', v_page,
    'page_size', v_page_size,
    'rows', coalesce((select jsonb_agg(to_jsonb(paged.*)) from paged), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;