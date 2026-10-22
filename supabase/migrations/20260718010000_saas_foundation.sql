-- SaaS foundation: organizations, stores, memberships, plans and integrations.
-- This migration is intentionally additive. It keeps the current Atacadão flows
-- working while introducing explicit ownership for the next migration phases.

begin;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  legal_name text,
  cnpj text,
  status text not null default 'active'
    check (status in ('trial', 'active', 'suspended', 'cancelled')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  slug text not null,
  cnpj text,
  state_registration text,
  is_headquarters boolean not null default false,
  active boolean not null default true,
  timezone text not null default 'America/Fortaleza',
  address jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, slug),
  unique (organization_id, id)
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null
    check (role in ('owner', 'admin', 'manager', 'pharmacist', 'seller', 'support')),
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'revoked')),
  default_store_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  constraint organization_memberships_default_store_same_org_fk
    foreign key (organization_id, default_store_id)
    references public.stores (organization_id, id)
    on delete restrict
);

create table if not exists public.organization_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  hostname text not null unique,
  is_primary boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'disabled')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint organization_domains_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete cascade
);

create table if not exists public.plans (
  id text primary key,
  name text not null,
  description text,
  active boolean not null default true,
  price_monthly numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.features (
  key text primary key,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_features (
  plan_id text not null references public.plans(id) on delete cascade,
  feature_key text not null references public.features(key) on delete cascade,
  enabled boolean not null default true,
  limits jsonb not null default '{}'::jsonb,
  primary key (plan_id, feature_key)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'paused', 'cancelled')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_feature_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_key text not null references public.features(key) on delete cascade,
  enabled boolean not null,
  limits jsonb not null default '{}'::jsonb,
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (organization_id, feature_key)
);

create table if not exists public.organization_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  kind text not null
    check (kind in ('erp', 'fiscal', 'payment', 'whatsapp', 'delivery', 'marketplace', 'other')),
  provider text not null,
  status text not null default 'inactive'
    check (status in ('inactive', 'pending', 'active', 'error', 'disabled')),
  config jsonb not null default '{}'::jsonb,
  secret_ref text,
  last_connection_status text,
  last_connection_test_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_integrations_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete cascade
);

create unique index if not exists organization_integrations_scope_provider_uidx
  on public.organization_integrations (
    organization_id,
    coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind,
    provider
  );

create unique index if not exists organization_primary_domain_uidx
  on public.organization_domains (organization_id)
  where is_primary and status <> 'disabled';

create index if not exists stores_organization_idx
  on public.stores (organization_id);

create index if not exists organization_memberships_user_idx
  on public.organization_memberships (user_id, status);

create index if not exists organization_memberships_org_idx
  on public.organization_memberships (organization_id, role, status);

create index if not exists organization_integrations_org_idx
  on public.organization_integrations (organization_id, kind, status);

create or replace function public.set_saas_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_saas_updated_at();

drop trigger if exists stores_set_updated_at on public.stores;
create trigger stores_set_updated_at
before update on public.stores
for each row execute function public.set_saas_updated_at();

drop trigger if exists organization_memberships_set_updated_at on public.organization_memberships;
create trigger organization_memberships_set_updated_at
before update on public.organization_memberships
for each row execute function public.set_saas_updated_at();

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_saas_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_saas_updated_at();

drop trigger if exists organization_integrations_set_updated_at on public.organization_integrations;
create trigger organization_integrations_set_updated_at
before update on public.organization_integrations
for each row execute function public.set_saas_updated_at();

create or replace function public.is_organization_member(target_organization_id uuid)
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
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  );
$$;

create or replace function public.has_organization_role(
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
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role = any(allowed_roles)
  );
$$;

revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.has_organization_role(uuid, text[]) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, text[]) to authenticated;

alter table public.organizations enable row level security;
alter table public.stores enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_domains enable row level security;
alter table public.plans enable row level security;
alter table public.features enable row level security;
alter table public.plan_features enable row level security;
alter table public.subscriptions enable row level security;
alter table public.organization_feature_overrides enable row level security;
alter table public.organization_integrations enable row level security;

drop policy if exists "organization members can read organization" on public.organizations;
create policy "organization members can read organization"
on public.organizations for select
to authenticated
using (public.is_organization_member(id));

drop policy if exists "organization admins can update organization" on public.organizations;
create policy "organization admins can update organization"
on public.organizations for update
to authenticated
using (public.has_organization_role(id, array['owner', 'admin']))
with check (public.has_organization_role(id, array['owner', 'admin']));

drop policy if exists "organization members can read stores" on public.stores;
create policy "organization members can read stores"
on public.stores for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "organization admins can manage stores" on public.stores;
create policy "organization admins can manage stores"
on public.stores for all
to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "members can read memberships in their organization" on public.organization_memberships;
create policy "members can read memberships in their organization"
on public.organization_memberships for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
);

drop policy if exists "organization admins can manage memberships" on public.organization_memberships;
create policy "organization admins can manage memberships"
on public.organization_memberships for all
to authenticated
using (
  public.has_organization_role(organization_id, array['owner'])
  or (
    role <> 'owner'
    and public.has_organization_role(organization_id, array['admin'])
  )
)
with check (
  public.has_organization_role(organization_id, array['owner'])
  or (
    role <> 'owner'
    and public.has_organization_role(organization_id, array['admin'])
  )
);

drop policy if exists "verified domains are public" on public.organization_domains;
create policy "verified domains are public"
on public.organization_domains for select
to anon, authenticated
using (status = 'verified');

drop policy if exists "organization admins can manage domains" on public.organization_domains;
create policy "organization admins can manage domains"
on public.organization_domains for all
to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "active plans are public" on public.plans;
create policy "active plans are public"
on public.plans for select
to anon, authenticated
using (active);

drop policy if exists "active features are public" on public.features;
create policy "active features are public"
on public.features for select
to anon, authenticated
using (active);

drop policy if exists "active plan features are public" on public.plan_features;
create policy "active plan features are public"
on public.plan_features for select
to anon, authenticated
using (
  enabled
  and exists (
    select 1 from public.plans plan
    where plan.id = plan_id and plan.active
  )
);

drop policy if exists "organization members can read subscription" on public.subscriptions;
create policy "organization members can read subscription"
on public.subscriptions for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "organization members can read feature overrides" on public.organization_feature_overrides;
create policy "organization members can read feature overrides"
on public.organization_feature_overrides for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "organization admins can manage feature overrides" on public.organization_feature_overrides;
create policy "organization admins can manage feature overrides"
on public.organization_feature_overrides for all
to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "organization admins can read integrations" on public.organization_integrations;
create policy "organization admins can read integrations"
on public.organization_integrations for select
to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists "organization admins can manage integrations" on public.organization_integrations;
create policy "organization admins can manage integrations"
on public.organization_integrations for all
to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

-- Stable IDs make the bootstrap idempotent and provide an explicit owner for
-- legacy rows during the transition. They are not special in application code.
insert into public.organizations (
  id, name, slug, legal_name, status
)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Atacadão dos Medicamentos',
  'atacadao-dos-medicamentos',
  'Farmácia Atacadão dos Medicamentos',
  'active'
)
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    legal_name = coalesce(public.organizations.legal_name, excluded.legal_name),
    status = excluded.status;

insert into public.stores (
  id, organization_id, name, code, slug, is_headquarters, active
)
values (
  '00000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Atacadão dos Medicamentos — Matriz',
  'MATRIZ',
  'matriz',
  true,
  true
)
on conflict (id) do update
set name = excluded.name,
    organization_id = excluded.organization_id,
    active = true;

insert into public.organization_memberships (
  organization_id, user_id, role, status, default_store_id
)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  legacy.user_id,
  case
    when legacy.role::text = 'admin' then 'admin'
    when legacy.role::text = 'seller' then 'seller'
    else 'support'
  end,
  'active',
  '00000000-0000-0000-0000-000000000002'::uuid
from public.user_roles legacy
where legacy.role::text in ('admin', 'seller')
on conflict (organization_id, user_id) do nothing;

insert into public.plans (id, name, description, active)
values
  ('pilot', 'Cliente zero', 'Plano interno para validação do ecossistema', true),
  ('starter', 'Essencial', 'Comércio digital e operação básica', true),
  ('growth', 'Crescimento', 'Operação omnichannel e automações', true)
on conflict (id) do nothing;

insert into public.features (key, name, description)
values
  ('storefront', 'Loja virtual', 'Catálogo e checkout da farmácia'),
  ('trier_integration', 'Integração Trier', 'Catálogo, estoque, preços e pedidos'),
  ('payments', 'Pagamentos', 'Pix e cartão'),
  ('prescriptions', 'Receitas', 'Envio e fluxo de análise de receitas'),
  ('delivery', 'Delivery', 'Cálculo e gestão de entregas'),
  ('data_quality', 'Qualidade de dados', 'Diagnóstico e correção do catálogo')
on conflict (key) do nothing;

insert into public.plan_features (plan_id, feature_key, enabled)
select 'pilot', feature.key, true
from public.features feature
on conflict (plan_id, feature_key) do nothing;

insert into public.subscriptions (
  organization_id, plan_id, status, current_period_start
)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'pilot',
  'active',
  now()
)
on conflict (organization_id) do nothing;

-- Associate the settings already used by the current application with the
-- client zero. Columns stay nullable at this stage to keep rollback simple.
alter table public.store_settings
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists store_id uuid references public.stores(id);

alter table public.trier_settings
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists store_id uuid references public.stores(id);

alter table public.payment_settings
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists store_id uuid references public.stores(id);

update public.store_settings
set organization_id = coalesce(
      organization_id,
      '00000000-0000-0000-0000-000000000001'::uuid
    ),
    store_id = coalesce(
      store_id,
      '00000000-0000-0000-0000-000000000002'::uuid
    )
where organization_id is null or store_id is null;

update public.trier_settings
set organization_id = coalesce(
      organization_id,
      '00000000-0000-0000-0000-000000000001'::uuid
    ),
    store_id = coalesce(
      store_id,
      '00000000-0000-0000-0000-000000000002'::uuid
    )
where organization_id is null or store_id is null;

update public.payment_settings
set organization_id = coalesce(
      organization_id,
      '00000000-0000-0000-0000-000000000001'::uuid
    ),
    store_id = coalesce(
      store_id,
      '00000000-0000-0000-0000-000000000002'::uuid
    )
where organization_id is null or store_id is null;

do $tenant_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'store_settings_store_same_org_fk'
      and conrelid = 'public.store_settings'::regclass
  ) then
    alter table public.store_settings
      add constraint store_settings_store_same_org_fk
      foreign key (organization_id, store_id)
      references public.stores (organization_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'trier_settings_store_same_org_fk'
      and conrelid = 'public.trier_settings'::regclass
  ) then
    alter table public.trier_settings
      add constraint trier_settings_store_same_org_fk
      foreign key (organization_id, store_id)
      references public.stores (organization_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_settings_store_same_org_fk'
      and conrelid = 'public.payment_settings'::regclass
  ) then
    alter table public.payment_settings
      add constraint payment_settings_store_same_org_fk
      foreign key (organization_id, store_id)
      references public.stores (organization_id, id)
      on delete restrict;
  end if;
end;
$tenant_constraints$;

create index if not exists store_settings_organization_idx
  on public.store_settings (organization_id, store_id);

create index if not exists trier_settings_organization_idx
  on public.trier_settings (organization_id, store_id);

create index if not exists payment_settings_organization_idx
  on public.payment_settings (organization_id, store_id);

-- Register the existing Trier connection without copying its token. The token
-- remains in the current secret during the compatibility phase.
insert into public.organization_integrations (
  organization_id, store_id, kind, provider, status, config, secret_ref
)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'erp',
  'trier',
  case when coalesce(settings.last_connection_status, '') = 'success' then 'active' else 'pending' end,
  jsonb_strip_nulls(jsonb_build_object(
    'legacy_settings_id', settings.id,
    'base_url', settings.base_url,
    'branch_code', settings.branch_code,
    'environment', settings.environment
  )),
  'legacy-env:TRIER_API_TOKEN'
from public.trier_settings settings
where settings.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
limit 1
on conflict do nothing;

comment on table public.organization_integrations is
  'Integration metadata only. Secrets must be stored in a vault and referenced by secret_ref.';

comment on column public.organization_integrations.config is
  'Non-secret provider configuration. Never store tokens, passwords, certificates or private keys here.';

commit;
