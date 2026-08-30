create or replace function public.public_bestseller_product_ids(_days integer default 30, _limit integer default 12)
returns table(product_id uuid, rank_position integer)
language sql
stable
security definer
set search_path to ''
as $function$
  with params as (
    select
      case when _days is null or _days <= 0 then 30 else least(_days, 365) end as days,
      greatest(1, least(coalesce(_limit, 12), 60)) as lim
  ), ranked as (
    select b.*
      from params x,
           lateral public.public_bestsellers(x.days, greatest(x.lim * 5, x.lim)) b
  ), vendable as (
    select r.product_id,
           row_number() over (order by r.units desc, r.orders_count desc, r.last_sale_at desc, r.revenue desc)::integer as rank_position
      from ranked r
      join public.products p on p.id = r.product_id
     where p.active = true
       and coalesce(p.stock, 0) > 0
       and coalesce(p.price, 0) > 0
       and p.archived_at is null
  )
  select v.product_id, v.rank_position
    from vendable v, params x
   where v.rank_position <= x.lim
   order by v.rank_position;
$function$;

revoke all on function public.public_bestseller_product_ids(integer, integer) from public;
grant execute on function public.public_bestseller_product_ids(integer, integer) to anon, authenticated, service_role;
comment on function public.public_bestseller_product_ids(integer, integer) is 'Public-safe bestseller ranking: exposes only sellable product IDs and rank, without units, order counts or revenue.';
