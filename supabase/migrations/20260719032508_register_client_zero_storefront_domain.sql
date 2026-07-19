-- Register the verified public hostname used to resolve the client-zero
-- storefront. The application normalizes a leading `www.` before querying.

begin;

insert into public.organization_domains (
  organization_id,
  store_id,
  hostname,
  is_primary,
  status,
  verified_at
)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'atacadaodosmedicamentos.com.br',
  true,
  'verified',
  now()
)
on conflict (hostname) do update
set organization_id = excluded.organization_id,
    store_id = excluded.store_id,
    is_primary = excluded.is_primary,
    status = excluded.status,
    verified_at = coalesce(public.organization_domains.verified_at, excluded.verified_at);

commit;
