-- SaaS Core Foundation v2
-- SAFE/ADDITIVE: reuses the existing public.tenants + public.stores model.
-- This migration intentionally does NOT tenantize/backfill orders, products,
-- prescriptions, profiles, payments or integrations. That cutover is separate.

-- 1) Membership: one user may belong to many tenants with a tenant-scoped role.
create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','pharmacist','manager','cashier','seller','inventory','finance','viewer')),
  status text not null default 'active' check (status in ('active','invited','suspended','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,user_id)
);

-- Optional store scope. Absence means tenant-wide scope according to role/module rules.
create table if not exists public.store_memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (store_id,user_id)
);

-- 2) Platform administration is deliberately separate from pharmacy administration.
-- It is NOT automatically a grant to clinical/prescription data.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'platform_admin' check (role in ('platform_admin','platform_support','platform_auditor')),
  status text not null default 'active' check (status in ('active','suspended','inactive')),
  created_at timestamptz not null default now()
);

-- 3) Domain routing. Supports own customer domains and future platform subdomains.
create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  hostname text not null unique,
  domain_type text not null default 'app' check (domain_type in ('app','storefront','admin')),
  is_primary boolean not null default false,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','failed')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (hostname = lower(hostname) and hostname !~ '[/ :]')
);
create unique index if not exists tenant_domains_one_primary_per_type
  on public.tenant_domains(tenant_id,domain_type) where is_primary;

-- 4) Feature/module entitlement per pharmacy.
create table if not exists public.tenant_modules (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id,module_key)
);

-- 5) Extend the audit trail already used by production; do not create a parallel log.
alter table public.admin_audit_log add column if not exists tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.admin_audit_log add column if not exists store_id uuid references public.stores(id) on delete restrict;
create index if not exists admin_audit_log_tenant_created_idx on public.admin_audit_log(tenant_id,created_at desc);

create index if not exists tenant_memberships_user_idx on public.tenant_memberships(user_id,tenant_id);
create index if not exists store_memberships_user_idx on public.store_memberships(user_id,store_id);
create index if not exists tenant_domains_tenant_idx on public.tenant_domains(tenant_id);

-- 6) Authorization helpers. SECURITY DEFINER avoids recursive RLS lookups.
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.platform_admins p
    where p.user_id=auth.uid() and p.status='active' and p.role='platform_admin'
  );
$$;

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id=p_tenant_id and m.user_id=auth.uid() and m.status='active'
  );
$$;

create or replace function public.has_tenant_role(p_tenant_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id=p_tenant_id and m.user_id=auth.uid()
      and m.status='active' and m.role=any(p_roles)
  );
$$;

create or replace function public.is_store_member(p_store_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.store_memberships sm
    join public.stores s on s.id=sm.store_id and s.tenant_id=sm.tenant_id
    where sm.store_id=p_store_id and sm.user_id=auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_tenant_member(uuid) from public;
revoke all on function public.has_tenant_role(uuid,text[]) from public;
revoke all on function public.is_store_member(uuid) from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.has_tenant_role(uuid,text[]) to authenticated;
grant execute on function public.is_store_member(uuid) to authenticated;

-- 7) RLS for NEW SaaS-core tables only.
-- Existing tenants/stores policies are intentionally untouched in this phase so
-- the live POS/admin is not broken before memberships are backfilled.
alter table public.tenant_memberships enable row level security;
alter table public.store_memberships enable row level security;
alter table public.platform_admins enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.tenant_modules enable row level security;

drop policy if exists tenant_memberships_read on public.tenant_memberships;
create policy tenant_memberships_read on public.tenant_memberships for select to authenticated
using (user_id=auth.uid() or public.has_tenant_role(tenant_id,array['owner','admin']) or public.is_platform_admin());

drop policy if exists tenant_memberships_manage on public.tenant_memberships;
create policy tenant_memberships_manage on public.tenant_memberships for all to authenticated
using (public.has_tenant_role(tenant_id,array['owner','admin']) or public.is_platform_admin())
with check (public.has_tenant_role(tenant_id,array['owner','admin']) or public.is_platform_admin());

drop policy if exists store_memberships_read on public.store_memberships;
create policy store_memberships_read on public.store_memberships for select to authenticated
using (user_id=auth.uid() or public.has_tenant_role(tenant_id,array['owner','admin','manager']) or public.is_platform_admin());

drop policy if exists store_memberships_manage on public.store_memberships;
create policy store_memberships_manage on public.store_memberships for all to authenticated
using (public.has_tenant_role(tenant_id,array['owner','admin']) or public.is_platform_admin())
with check (public.has_tenant_role(tenant_id,array['owner','admin']) or public.is_platform_admin());

drop policy if exists platform_admins_self_read on public.platform_admins;
create policy platform_admins_self_read on public.platform_admins for select to authenticated using (user_id=auth.uid());
-- No client-side insert/update/delete policy for platform_admins. Provisioning must be privileged/server-side.

drop policy if exists tenant_domains_read on public.tenant_domains;
create policy tenant_domains_read on public.tenant_domains for select to authenticated
using (public.is_tenant_member(tenant_id) or public.is_platform_admin());

drop policy if exists tenant_domains_manage on public.tenant_domains;
create policy tenant_domains_manage on public.tenant_domains for all to authenticated
using (public.has_tenant_role(tenant_id,array['owner','admin']) or public.is_platform_admin())
with check (public.has_tenant_role(tenant_id,array['owner','admin']) or public.is_platform_admin());

drop policy if exists tenant_modules_read on public.tenant_modules;
create policy tenant_modules_read on public.tenant_modules for select to authenticated
using (public.is_tenant_member(tenant_id) or public.is_platform_admin());

drop policy if exists tenant_modules_manage on public.tenant_modules;
create policy tenant_modules_manage on public.tenant_modules for all to authenticated
using (public.has_tenant_role(tenant_id,array['owner','admin']) or public.is_platform_admin())
with check (public.has_tenant_role(tenant_id,array['owner','admin']) or public.is_platform_admin());

-- Service role is the only bootstrap path before tenant memberships exist.
grant select on public.tenant_memberships,public.store_memberships,public.platform_admins,public.tenant_domains,public.tenant_modules to authenticated;
grant all on public.tenant_memberships,public.store_memberships,public.platform_admins,public.tenant_domains,public.tenant_modules to service_role;

comment on table public.tenant_memberships is 'Tenant-scoped SaaS membership/RBAC; supersedes global roles gradually, after backfill.';
comment on table public.store_memberships is 'Optional unit scope inside a tenant; stores remains the canonical establishment table.';
comment on table public.platform_admins is 'Platform control-plane identity. Does not itself grant clinical/prescription access.';
comment on table public.tenant_domains is 'Verified hostnames routed to a tenant/store.';
comment on table public.tenant_modules is 'Feature entitlements/configuration per tenant.';
