-- Run after applying 20260718010000_saas_foundation.sql in a disposable
-- Supabase environment. This script is read-only and fails fast on an invalid
-- or incomplete bootstrap.

begin;

do $$
declare
  client_zero uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  client_zero_store uuid := '00000000-0000-0000-0000-000000000002'::uuid;
begin
  if to_regclass('public.organizations') is null then
    raise exception 'organizations table was not created';
  end if;

  if to_regclass('public.stores') is null then
    raise exception 'stores table was not created';
  end if;

  if to_regclass('public.organization_memberships') is null then
    raise exception 'organization_memberships table was not created';
  end if;

  if to_regclass('public.organization_integrations') is null then
    raise exception 'organization_integrations table was not created';
  end if;

  if not exists (
    select 1 from public.organizations
    where id = client_zero
      and slug = 'atacadao-dos-medicamentos'
      and status = 'active'
  ) then
    raise exception 'client zero organization was not bootstrapped';
  end if;

  if not exists (
    select 1 from public.stores
    where id = client_zero_store
      and organization_id = client_zero
      and is_headquarters
      and active
  ) then
    raise exception 'client zero store was not bootstrapped';
  end if;

  if exists (
    select 1
    from public.user_roles legacy
    where legacy.role::text in ('admin', 'seller')
      and not exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = client_zero
          and membership.user_id = legacy.user_id
          and membership.status = 'active'
      )
  ) then
    raise exception 'one or more legacy staff users were not migrated to memberships';
  end if;

  if exists (
    select 1 from public.store_settings
    where organization_id is distinct from client_zero
       or store_id is distinct from client_zero_store
  ) then
    raise exception 'store_settings has rows without the client zero ownership';
  end if;

  if exists (
    select 1 from public.trier_settings
    where organization_id is distinct from client_zero
       or store_id is distinct from client_zero_store
  ) then
    raise exception 'trier_settings has rows without the client zero ownership';
  end if;

  if exists (
    select 1 from public.payment_settings
    where organization_id is distinct from client_zero
       or store_id is distinct from client_zero_store
  ) then
    raise exception 'payment_settings has rows without the client zero ownership';
  end if;

  if exists (
    select 1
    from public.organization_integrations integration
    where integration.config ?| array[
      'token',
      'access_token',
      'refresh_token',
      'password',
      'client_secret',
      'private_key',
      'certificate'
    ]
  ) then
    raise exception 'secret-like keys were stored in organization_integrations.config';
  end if;

  if not exists (
    select 1 from public.subscriptions
    where organization_id = client_zero
      and plan_id = 'pilot'
      and status = 'active'
  ) then
    raise exception 'client zero pilot subscription was not bootstrapped';
  end if;
end;
$$;

rollback;
