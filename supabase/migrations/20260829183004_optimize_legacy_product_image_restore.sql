create or replace function public.service_restore_legacy_product_images(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with src as (
    select distinct on (trier_product_id)
      trier_product_id,
      image_url
    from jsonb_to_recordset(p_rows) as x(
      trier_product_id text,
      sku text,
      barcode text,
      image_url text
    )
    where nullif(trier_product_id,'') is not null
      and nullif(image_url,'') is not null
    order by trier_product_id
  ), upd as (
    update public.products p
       set image_url = s.image_url
      from src s
     where p.trier_product_id = s.trier_product_id
       and p.image_url is distinct from s.image_url
    returning p.id
  )
  select count(*) into v_count from upd;
  return v_count;
end;
$$;

revoke all on function public.service_restore_legacy_product_images(jsonb) from public, anon, authenticated;
grant execute on function public.service_restore_legacy_product_images(jsonb) to service_role;
notify pgrst, 'reload schema';
