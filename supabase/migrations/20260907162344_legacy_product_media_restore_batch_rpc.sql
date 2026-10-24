create or replace function public.get_legacy_product_media_missing(p_limit integer default 100)
returns table(entity_id uuid, field_name text, source_url text, filename text)
language sql
security definer
set search_path = public, storage
as $$
  select l.entity_id,
         l.field_name,
         l.source_url,
         regexp_replace(l.source_url, '^.*/', '') as filename
  from public.legacy_media_refs l
  where l.entity_type = 'product'
    and not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'products'
        and o.name = regexp_replace(l.source_url, '^.*/', '')
    )
  order by l.id
  limit greatest(1, least(coalesce(p_limit, 100), 250));
$$;

revoke all on function public.get_legacy_product_media_missing(integer) from public, anon, authenticated;
grant execute on function public.get_legacy_product_media_missing(integer) to service_role;
