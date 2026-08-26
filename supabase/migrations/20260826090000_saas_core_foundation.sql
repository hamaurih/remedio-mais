-- SaaS Core Foundation — additive/reversible foundation only.
-- IMPORTANT: this migration does NOT attach existing production rows yet.
-- Backfill/cutover must happen in a separate, audited migration after validation.

create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  legal_name text not null,
  trade_name text,
  tax_id text,
  status text not null default 'active' check (status in ('active','suspended','inactive','onboarding')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.establishments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null,
  legal_name text,
  trade_name text not null,
  tax_id text,
  is_headquarters boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive','onboarding')),
  address jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','pharmacist','manager','cashier','seller','inventory','finance','viewer')),
  status text not null default 'active' check (status in ('active','invited','suspended','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists public.establishment_users (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (establishment_id, user_id)
);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'platform_admin' check (role in ('platform_admin','platform_support','platform_auditor')),
  status text not null default 'active' check (status in ('active','suspended','inactive')),
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  establishment_id uuid references public.establishments(id) on delete cascade,
  hostname text not null unique,
  domain_type text not null default 'app' check (domain_type in ('app','storefront','admin')),
  is_primary boolean not null default false,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','failed')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_modules (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, module_key)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete restrict,
  establishment_id uuid references public.establishments(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_establishments_tenant on public.establishments(tenant_id);
create index if not exists idx_tenant_users_user on public.tenant_users(user_id, tenant_id);
create index if not exists idx_establishment_users_user on public.establishment_users(user_id, establishment_id);
create index if not exists idx_tenant_domains_tenant on public.tenant_domains(tenant_id);
create index if not exists idx_audit_logs_tenant_created on public.audit_logs(tenant_id, created_at desc);

-- Security-definer helpers centralize tenant membership checks and avoid recursive RLS.
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid() and pa.status = 'active' and pa.role = 'platform_admin'); $$;

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.tenant_users tu where tu.tenant_id = p_tenant_id and tu.user_id = auth.uid() and tu.status = 'active'); $$;

create or replace function public.has_tenant_role(p_tenant_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.tenant_users tu where tu.tenant_id = p_tenant_id and tu.user_id = auth.uid() and tu.status = 'active' and tu.role = any(p_roles)); $$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_tenant_member(uuid) from public;
revoke all on function public.has_tenant_role(uuid,text[]) from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.has_tenant_role(uuid,text[]) to authenticated;

alter table public.tenants enable row level security;
alter table public.establishments enable row level security;
alter table public.tenant_users enable row level security;
alter table public.establishment_users enable row level security;
alter table public.platform_admins enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.tenant_modules enable row level security;
alter table public.audit_logs enable row level security;

-- Platform admins can manage platform metadata; tenant users see only their own tenant.
create policy tenants_select on public.tenants for select to authenticated using (public.is_platform_admin() or public.is_tenant_member(id));
create policy tenants_platform_manage on public.tenants for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy establishments_select on public.establishments for select to authenticated using (public.is_platform_admin() or public.is_tenant_member(tenant_id));
create policy establishments_manage on public.establishments for all to authenticated using (public.is_platform_admin() or public.has_tenant_role(tenant_id,array['owner','admin'])) with check (public.is_platform_admin() or public.has_tenant_role(tenant_id,array['owner','admin']));

create policy tenant_users_select on public.tenant_users for select to authenticated using (public.is_platform_admin() or public.is_tenant_member(tenant_id));
create policy tenant_users_manage on public.tenant_users for all to authenticated using (public.is_platform_admin() or public.has_tenant_role(tenant_id,array['owner','admin'])) with check (public.is_platform_admin() or public.has_tenant_role(tenant_id,array['owner','admin']));

create policy establishment_users_select on public.establishment_users for select to authenticated using (public.is_platform_admin() or public.is_tenant_member(tenant_id));
create policy establishment_users_manage on public.establishment_users for all to authenticated using (public.is_platform_admin() or public.has_tenant_role(tenant_id,array['owner','admin'])) with check (public.is_platform_admin() or public.has_tenant_role(tenant_id,array['owner','admin']));

-- Platform admin identities are not tenant-visible.
create policy platform_admins_self_select on public.platform_admins for select to authenticated using (user_id = auth.uid());

create policy tenant_domains_select on public.tenant_domains for select to authenticated using (public.is_platform_admin() or public.is_tenant_member(tenant_id));
create policy tenant_domains_manage on public.tenant_domains for all to authenticated using (public.is_platform_admin() or public.has_tenant_role(tenant_id,array['owner','admin'])) with check (public.is_platform_admin() or public.has_tenant_role(tenant_id,array['owner','admin']));

create policy tenant_modules_select on public.tenant_modules for select to authenticated using (public.is_platform_admin() or public.is_tenant_member(tenant_id));
create policy tenant_modules_manage on public.tenant_modules for all to authenticated using (public.is_platform_admin() or public.has_tenant_role(tenant_id,array['owner','admin'])) with check (public.is_platform_admin() or public.has_tenant_role(tenant_id,array['owner','admin']));

-- Audit is append-oriented. Tenant managers can read; authenticated users may only append within their tenant.
create policy audit_logs_select on public.audit_logs for select to authenticated using (public.is_platform_admin() or public.has_tenant_role(tenant_id,array['owner','admin','manager']));
create policy audit_logs_insert on public.audit_logs for insert to authenticated with check (actor_user_id = auth.uid() and public.is_tenant_member(tenant_id));

comment on table public.tenants is 'SaaS customer/account boundary. No existing production data is backfilled by this migration.';
comment on table public.platform_admins is 'Platform-level administration; must not imply automatic access to clinical/regulated tenant data.';
comment on table public.audit_logs is 'Append-oriented security and operational audit trail.';
