-- Run after the SaaS foundation and storefront-domain migrations.

begin;

do $$
begin
  if not exists (
    select 1
    from public.organization_domains
    where hostname = 'atacadaodosmedicamentos.com.br'
      and organization_id = '00000000-0000-0000-0000-000000000001'::uuid
      and store_id = '00000000-0000-0000-0000-000000000002'::uuid
      and status = 'verified'
      and is_primary
  ) then
    raise exception 'the client-zero storefront domain was not registered';
  end if;
end;
$$;

insert into public.organization_domains (
  organization_id, store_id, hostname, status
)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'pending.invalid.test',
  'pending'
);

set local role anon;

do $$
declare
  verified_count integer;
  pending_count integer;
begin
  select count(*) into verified_count
  from public.organization_domains
  where hostname = 'atacadaodosmedicamentos.com.br';

  select count(*) into pending_count
  from public.organization_domains
  where hostname = 'pending.invalid.test';

  if verified_count <> 1 then
    raise exception 'anonymous domain resolution cannot read the verified domain';
  end if;

  if pending_count <> 0 then
    raise exception 'anonymous domain resolution can read an unverified domain';
  end if;
end;
$$;

rollback;
