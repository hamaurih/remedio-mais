-- Harden the SaaS authorization helpers and remove avoidable RLS/FK overhead.
-- This migration follows the additive foundation migration and is safe to apply
-- to environments where Supabase default privileges granted EXECUTE to anon.

begin;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create or replace function private.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function private.has_organization_role(
  target_organization_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = any(allowed_roles)
  );
$$;

revoke all on function private.is_organization_member(uuid) from public;
revoke all on function private.is_organization_member(uuid) from anon;
revoke all on function private.has_organization_role(uuid, text[]) from public;
revoke all on function private.has_organization_role(uuid, text[]) from anon;
grant execute on function private.is_organization_member(uuid) to authenticated;
grant execute on function private.has_organization_role(uuid, text[]) to authenticated;

drop policy if exists "organization members can read organization" on public.organizations;
create policy "organization members can read organization"
on public.organizations for select
to authenticated
using (private.is_organization_member(id));

drop policy if exists "organization admins can update organization" on public.organizations;
create policy "organization admins can update organization"
on public.organizations for update
to authenticated
using (private.has_organization_role(id, array['owner', 'admin']))
with check (private.has_organization_role(id, array['owner', 'admin']));

drop policy if exists "organization members can read stores" on public.stores;
create policy "organization members can read stores"
on public.stores for select
to authenticated
using (private.is_organization_member(organization_id));

drop policy if exists "organization admins can manage stores" on public.stores;
drop policy if exists "organization admins can create stores" on public.stores;
create policy "organization admins can create stores"
on public.stores for insert
to authenticated
with check (private.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "organization admins can update stores" on public.stores;
create policy "organization admins can update stores"
on public.stores for update
to authenticated
using (private.has_organization_role(organization_id, array['owner', 'admin']))
with check (private.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "organization admins can delete stores" on public.stores;
create policy "organization admins can delete stores"
on public.stores for delete
to authenticated
using (private.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "members can read memberships in their organization" on public.organization_memberships;
create policy "members can read memberships in their organization"
on public.organization_memberships for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_organization_member(organization_id)
);

drop policy if exists "organization admins can manage memberships" on public.organization_memberships;
drop policy if exists "organization admins can create memberships" on public.organization_memberships;
create policy "organization admins can create memberships"
on public.organization_memberships for insert
to authenticated
with check (
  private.has_organization_role(organization_id, array['owner'])
  or (
    role <> 'owner'
    and private.has_organization_role(organization_id, array['admin'])
  )
);

drop policy if exists "organization admins can update memberships" on public.organization_memberships;
create policy "organization admins can update memberships"
on public.organization_memberships for update
to authenticated
using (
  private.has_organization_role(organization_id, array['owner'])
  or (
    role <> 'owner'
    and private.has_organization_role(organization_id, array['admin'])
  )
)
with check (
  private.has_organization_role(organization_id, array['owner'])
  or (
    role <> 'owner'
    and private.has_organization_role(organization_id, array['admin'])
  )
);

drop policy if exists "organization admins can delete memberships" on public.organization_memberships;
create policy "organization admins can delete memberships"
on public.organization_memberships for delete
to authenticated
using (
  private.has_organization_role(organization_id, array['owner'])
  or (
    role <> 'owner'
    and private.has_organization_role(organization_id, array['admin'])
  )
);

drop policy if exists "verified domains are public" on public.organization_domains;
create policy "verified domains are public"
on public.organization_domains for select
to anon
using (status = 'verified');

drop policy if exists "organization members can read domains" on public.organization_domains;
create policy "organization members can read domains"
on public.organization_domains for select
to authenticated
using (
  status = 'verified'
  or private.has_organization_role(organization_id, array['owner', 'admin'])
);

drop policy if exists "organization admins can manage domains" on public.organization_domains;
drop policy if exists "organization admins can create domains" on public.organization_domains;
create policy "organization admins can create domains"
on public.organization_domains for insert
to authenticated
with check (private.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "organization admins can update domains" on public.organization_domains;
create policy "organization admins can update domains"
on public.organization_domains for update
to authenticated
using (private.has_organization_role(organization_id, array['owner', 'admin']))
with check (private.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "organization admins can delete domains" on public.organization_domains;
create policy "organization admins can delete domains"
on public.organization_domains for delete
to authenticated
using (private.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "organization members can read subscription" on public.subscriptions;
create policy "organization members can read subscription"
on public.subscriptions for select
to authenticated
using (private.is_organization_member(organization_id));

drop policy if exists "organization members can read feature overrides" on public.organization_feature_overrides;
create policy "organization members can read feature overrides"
on public.organization_feature_overrides for select
to authenticated
using (private.is_organization_member(organization_id));

drop policy if exists "organization admins can manage feature overrides" on public.organization_feature_overrides;
drop policy if exists "organization admins can create feature overrides" on public.organization_feature_overrides;
create policy "organization admins can create feature overrides"
on public.organization_feature_overrides for insert
to authenticated
with check (private.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "organization admins can update feature overrides" on public.organization_feature_overrides;
create policy "organization admins can update feature overrides"
on public.organization_feature_overrides for update
to authenticated
using (private.has_organization_role(organization_id, array['owner', 'admin']))
with check (private.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "organization admins can delete feature overrides" on public.organization_feature_overrides;
create policy "organization admins can delete feature overrides"
on public.organization_feature_overrides for delete
to authenticated
using (private.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "organization admins can read integrations" on public.organization_integrations;
create policy "organization admins can read integrations"
on public.organization_integrations for select
to authenticated
using (private.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "organization admins can manage integrations" on public.organization_integrations;
drop policy if exists "organization admins can create integrations" on public.organization_integrations;
create policy "organization admins can create integrations"
on public.organization_integrations for insert
to authenticated
with check (private.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "organization admins can update integrations" on public.organization_integrations;
create policy "organization admins can update integrations"
on public.organization_integrations for update
to authenticated
using (private.has_organization_role(organization_id, array['owner', 'admin']))
with check (private.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "organization admins can delete integrations" on public.organization_integrations;
create policy "organization admins can delete integrations"
on public.organization_integrations for delete
to authenticated
using (private.has_organization_role(organization_id, array['owner', 'admin']));

drop function if exists public.is_organization_member(uuid);
drop function if exists public.has_organization_role(uuid, text[]);

create index if not exists organization_memberships_default_store_idx
  on public.organization_memberships (organization_id, default_store_id)
  where default_store_id is not null;

create index if not exists organization_domains_store_idx
  on public.organization_domains (organization_id, store_id)
  where store_id is not null;

create index if not exists organization_integrations_store_idx
  on public.organization_integrations (organization_id, store_id)
  where store_id is not null;

create index if not exists plan_features_feature_idx
  on public.plan_features (feature_key);

create index if not exists organization_feature_overrides_feature_idx
  on public.organization_feature_overrides (feature_key);

create index if not exists subscriptions_plan_idx
  on public.subscriptions (plan_id);

-- The composite constraints already guarantee that a store belongs to the same
-- organization. Keeping an additional single-column FK adds redundant checks
-- and requires a second set of indexes.
alter table public.store_settings
  drop constraint if exists store_settings_store_id_fkey;

alter table public.trier_settings
  drop constraint if exists trier_settings_store_id_fkey;

alter table public.payment_settings
  drop constraint if exists payment_settings_store_id_fkey;

commit;
