-- Run after applying 20260718010000_saas_foundation.sql in a disposable
-- Supabase environment. It exercises authorization with disposable rows and
-- rolls every change back. The script fails fast on an invalid bootstrap.

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
    from (
      values
        ('organization_memberships_default_store_same_org_fk'),
        ('organization_domains_store_same_org_fk'),
        ('organization_integrations_store_same_org_fk'),
        ('store_settings_store_same_org_fk'),
        ('trier_settings_store_same_org_fk'),
        ('payment_settings_store_same_org_fk')
    ) as expected(constraint_name)
    where not exists (
      select 1
      from pg_constraint constraint_definition
      where constraint_definition.conname = expected.constraint_name
        and constraint_definition.contype = 'f'
        and constraint_definition.connamespace = 'public'::regnamespace
    )
  ) then
    raise exception 'one or more tenant-safe store constraints are missing';
  end if;

  if exists (
    select 1
    from (
      values
        ('organization admins can create memberships', 'a'::char),
        ('organization admins can update memberships', 'w'::char),
        ('organization admins can delete memberships', 'd'::char)
    ) as expected(policy_name, command)
    where not exists (
      select 1
      from pg_policy policy
      where policy.polname = expected.policy_name
        and policy.polrelid = 'public.organization_memberships'::regclass
        and policy.polcmd = expected.command
    )
  ) then
    raise exception 'membership write policies were not split by operation';
  end if;

  if to_regprocedure('public.is_organization_member(uuid)') is not null
     or to_regprocedure('public.has_organization_role(uuid,text[])') is not null then
    raise exception 'security-definer authorization helpers remain in the exposed public schema';
  end if;

  if to_regprocedure('private.is_organization_member(uuid)') is null
     or to_regprocedure('private.has_organization_role(uuid,text[])') is null then
    raise exception 'private authorization helpers were not created';
  end if;

  if has_function_privilege(
       'anon',
       'private.is_organization_member(uuid)'::regprocedure,
       'execute'
     )
     or has_function_privilege(
       'anon',
       'private.has_organization_role(uuid,text[])'::regprocedure,
       'execute'
     ) then
    raise exception 'anonymous users can execute private authorization helpers';
  end if;

  if not has_function_privilege(
       'authenticated',
       'private.is_organization_member(uuid)'::regprocedure,
       'execute'
     )
     or not has_function_privilege(
       'authenticated',
       'private.has_organization_role(uuid,text[])'::regprocedure,
       'execute'
     ) then
    raise exception 'authenticated users cannot execute authorization helpers required by RLS';
  end if;

  if exists (
    select 1
    from (
      values
        ('organization_memberships_default_store_idx'),
        ('organization_domains_store_idx'),
        ('organization_integrations_store_idx'),
        ('plan_features_feature_idx'),
        ('organization_feature_overrides_feature_idx'),
        ('subscriptions_plan_idx')
    ) as expected(index_name)
    where to_regclass('public.' || expected.index_name) is null
  ) then
    raise exception 'one or more FK-supporting indexes are missing';
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


-- Exercise tenant isolation and role escalation through the actual RLS policies.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  (
    '20000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated', 'saas-admin-a@example.invalid', '',
    now(), now(), now()
  ),
  (
    '20000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated', 'saas-target@example.invalid', '',
    now(), now(), now()
  );

insert into public.organizations (id, name, slug, status)
values
  (
    '10000000-0000-0000-0000-000000000001'::uuid,
    'Tenant A', 'saas-test-tenant-a', 'active'
  ),
  (
    '10000000-0000-0000-0000-000000000002'::uuid,
    'Tenant B', 'saas-test-tenant-b', 'active'
  );

insert into public.stores (id, organization_id, name, code, slug)
values
  (
    '11000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000001'::uuid,
    'Store A', 'TEST-A', 'test-a'
  ),
  (
    '11000000-0000-0000-0000-000000000002'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid,
    'Store B', 'TEST-B', 'test-b'
  );

insert into public.organization_memberships (
  organization_id, user_id, role, status, default_store_id
)
values (
  '10000000-0000-0000-0000-000000000001'::uuid,
  '20000000-0000-0000-0000-000000000001'::uuid,
  'admin',
  'active',
  '11000000-0000-0000-0000-000000000001'::uuid
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000001',
  true
);

do $tenant_behavior$
declare
  visible_organizations integer;
begin
  select count(*)
  into visible_organizations
  from public.organizations
  where id in (
    '10000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid
  );

  if visible_organizations <> 1 then
    raise exception 'tenant isolation failed: expected one visible test organization, got %',
      visible_organizations;
  end if;

  begin
    insert into public.organization_memberships (
      organization_id, user_id, role, status
    )
    values (
      '10000000-0000-0000-0000-000000000001'::uuid,
      '20000000-0000-0000-0000-000000000002'::uuid,
      'owner',
      'active'
    );

    raise exception 'admin was able to assign the owner role';
  exception
    when insufficient_privilege then
      null;
  end;

  insert into public.organization_memberships (
    organization_id, user_id, role, status
  )
  values (
    '10000000-0000-0000-0000-000000000001'::uuid,
    '20000000-0000-0000-0000-000000000002'::uuid,
    'seller',
    'active'
  );

  if not exists (
    select 1
    from public.organization_memberships
    where organization_id = '10000000-0000-0000-0000-000000000001'::uuid
      and user_id = '20000000-0000-0000-0000-000000000002'::uuid
      and role = 'seller'
  ) then
    raise exception 'admin could not assign an allowed non-owner role';
  end if;
end;
$tenant_behavior$;

reset role;

rollback;
