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
    select *
    from jsonb_to_recordset(p_rows) as x(trier_product_id text, sku text, barcode text, image_url text)
    where nullif(image_url,'') is not null
  ), resolved as (
    select src.*, p.id as product_id
    from src
    join lateral (
      select pr.id
      from public.products pr
      where (nullif(src.trier_product_id,'') is not null and nullif(pr.trier_product_id,'') = nullif(src.trier_product_id,''))
         or (nullif(src.sku,'') is not null and nullif(pr.sku,'') = nullif(src.sku,''))
         or (nullif(src.barcode,'') is not null and (nullif(pr.barcode,'') = nullif(src.barcode,'') or nullif(pr.trier_barcode,'') = nullif(src.barcode,'')))
      order by
        (nullif(pr.trier_product_id,'') = nullif(src.trier_product_id,'')) desc,
        (nullif(pr.sku,'') = nullif(src.sku,'')) desc,
        (nullif(pr.barcode,'') = nullif(src.barcode,'')) desc,
        pr.active desc,
        pr.updated_at desc nulls last
      limit 1
    ) p on true
  ), upd as (
    update public.products p
       set image_url = r.image_url,
           updated_at = greatest(coalesce(p.updated_at, now()), now())
      from resolved r
     where p.id = r.product_id
       and p.image_url is distinct from r.image_url
    returning p.id
  )
  select count(*) into v_count from upd;
  return v_count;
end;
$$;

revoke all on function public.service_restore_legacy_product_images(jsonb) from public, anon, authenticated;
grant execute on function public.service_restore_legacy_product_images(jsonb) to service_role;
comment on function public.service_restore_legacy_product_images(jsonb) is 'Temporary service-role-only migration helper for restoring legacy product image URLs.';
