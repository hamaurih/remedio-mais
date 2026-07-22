create or replace function public.admin_products_list(
  _search text default null,
  _category_id uuid default null,
  _manufacturer text default null,
  _status text default 'all',
  _page integer default 1,
  _page_size integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
      )
  ), counted as (
    select count(*)::integer as total_count from filtered
  ), paged as (
    select *
    from filtered
    order by name asc nulls last
    offset v_offset
    limit v_page_size
  )
  select jsonb_build_object(
    'rows', coalesce(
      jsonb_agg(
        (to_jsonb(paged) - 'category_display_name') || jsonb_build_object('categories', jsonb_build_object('name', paged.category_display_name))
        order by paged.name asc nulls last
      ),
      '[]'::jsonb
    ),
    'count', (select total_count from counted)
  )
  into v_result
  from paged;

  return coalesce(v_result, jsonb_build_object('rows', '[]'::jsonb, 'count', 0));
end;
$$;

grant execute on function public.admin_products_list to authenticated;
grant execute on function public.admin_products_list to service_role;