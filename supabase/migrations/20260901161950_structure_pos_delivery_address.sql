alter table public.pos_delivery_quotes
  add column if not exists cep text,
  add column if not exists street text,
  add column if not exists number text,
  add column if not exists complement text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists reference text;

create or replace function public.sync_pos_delivery_quote_to_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q record;
begin
  if new.order_id is null or new.delivery_quote_id is null then
    return new;
  end if;

  select * into q
    from public.pos_delivery_quotes
   where id = new.delivery_quote_id;

  if q is null then
    return new;
  end if;

  update public.orders
     set customer_address = q.address,
         delivery_method = 'delivery',
         delivery_type = 'delivery',
         delivery_cep = nullif(q.cep, ''),
         delivery_street = coalesce(nullif(q.street, ''), q.address),
         delivery_number = nullif(q.number, ''),
         delivery_complement = nullif(q.complement, ''),
         delivery_neighborhood = nullif(q.neighborhood, ''),
         delivery_city = nullif(q.city, ''),
         delivery_state = nullif(upper(q.state), ''),
         delivery_reference = nullif(q.reference, ''),
         delivery_fee = q.fee,
         delivery_status = 'pending',
         delivery_lat = q.lat,
         delivery_lng = q.lng,
         delivery_distance_km = q.distance_km
   where id = new.order_id;

  return new;
end;
$$;

revoke all on function public.sync_pos_delivery_quote_to_order() from public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_pos_delivery_quote_to_order ON public.pos_sales;
create trigger trg_sync_pos_delivery_quote_to_order
after insert or update of order_id, delivery_quote_id on public.pos_sales
for each row
when (new.order_id is not null and new.delivery_quote_id is not null)
execute function public.sync_pos_delivery_quote_to_order();
