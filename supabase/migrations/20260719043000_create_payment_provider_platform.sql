-- Multi-provider payment routing. Credentials remain in Edge Function secrets;
-- these tables store only opaque secret names and non-sensitive configuration.

begin;

create table if not exists public.payment_providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  provider_key text not null,
  display_name text not null,
  environment text not null default 'sandbox',
  enabled boolean not null default false,
  capabilities text[] not null default '{}'::text[],
  credential_secret_name text,
  webhook_secret_name text,
  public_config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_providers_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores(organization_id, id)
    on delete cascade,
  constraint payment_providers_key_chk
    check (provider_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint payment_providers_environment_chk
    check (environment in ('sandbox', 'production')),
  constraint payment_providers_tenant_key
    unique (organization_id, store_id, provider_key),
  constraint payment_providers_tenant_identity
    unique (organization_id, store_id, id)
);

create table if not exists public.payment_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  provider_id uuid not null,
  payment_method text not null,
  currency text not null default 'BRL',
  priority integer not null default 100,
  enabled boolean not null default true,
  min_amount numeric(12,2),
  max_amount numeric(12,2),
  conditions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_routes_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores(organization_id, id)
    on delete cascade,
  constraint payment_routes_provider_same_tenant_fk
    foreign key (organization_id, store_id, provider_id)
    references public.payment_providers(organization_id, store_id, id)
    on delete cascade,
  constraint payment_routes_method_chk
    check (payment_method ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint payment_routes_currency_chk
    check (currency ~ '^[A-Z]{3}$'),
  constraint payment_routes_amount_chk
    check (
      (min_amount is null or min_amount >= 0)
      and (max_amount is null or max_amount >= 0)
      and (min_amount is null or max_amount is null or min_amount <= max_amount)
    ),
  constraint payment_routes_priority_chk check (priority between 1 and 10000),
  constraint payment_routes_tenant_priority
    unique (organization_id, store_id, payment_method, currency, priority)
);

create index if not exists payment_routes_lookup_idx
  on public.payment_routes (
    organization_id,
    store_id,
    payment_method,
    currency,
    enabled,
    priority
  );

alter table public.payment_providers enable row level security;
alter table public.payment_routes enable row level security;

create policy payment_providers_admin_select
on public.payment_providers
for select
to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
);

create policy payment_providers_admin_insert
on public.payment_providers
for insert
to authenticated
with check (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
  and private.is_active_store(organization_id, store_id)
);

create policy payment_providers_admin_update
on public.payment_providers
for update
to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
)
with check (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
  and private.is_active_store(organization_id, store_id)
);

create policy payment_providers_admin_delete
on public.payment_providers
for delete
to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
);

create policy payment_routes_admin_select
on public.payment_routes
for select
to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
);

create policy payment_routes_admin_insert
on public.payment_routes
for insert
to authenticated
with check (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
  and private.is_active_store(organization_id, store_id)
);

create policy payment_routes_admin_update
on public.payment_routes
for update
to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
)
with check (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
  and private.is_active_store(organization_id, store_id)
);

create policy payment_routes_admin_delete
on public.payment_routes
for delete
to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
);

revoke all on public.payment_providers, public.payment_routes from anon;
grant select, insert, update, delete
  on public.payment_providers, public.payment_routes
  to authenticated;
grant all on public.payment_providers, public.payment_routes to service_role;

-- Register the current implementation as the first adapter. No credential
-- values are copied into the database.
insert into public.payment_providers (
  organization_id,
  store_id,
  provider_key,
  display_name,
  environment,
  enabled,
  capabilities,
  credential_secret_name,
  webhook_secret_name,
  public_config
)
select
  payment_settings.organization_id,
  payment_settings.store_id,
  'mercado_pago',
  'Mercado Pago',
  coalesce(payment_settings.environment, 'sandbox'),
  true,
  array_remove(array[
    case when payment_settings.pix_enabled then 'pix' end,
    case when payment_settings.credit_card_enabled then 'credit_card' end,
    case when payment_settings.boleto_enabled then 'boleto' end
  ], null),
  'MERCADO_PAGO_ACCESS_TOKEN',
  'MERCADO_PAGO_WEBHOOK_SECRET',
  jsonb_build_object(
    'integration_mode',
    coalesce(payment_settings.modo_integracao, 'checkout_redirect')
  )
from public.payment_settings
on conflict (organization_id, store_id, provider_key)
do update set
  display_name = excluded.display_name,
  environment = excluded.environment,
  capabilities = excluded.capabilities,
  public_config = excluded.public_config,
  updated_at = now();

insert into public.payment_routes (
  organization_id,
  store_id,
  provider_id,
  payment_method,
  currency,
  priority,
  enabled
)
select
  provider.organization_id,
  provider.store_id,
  provider.id,
  method.payment_method,
  'BRL',
  100,
  true
from public.payment_providers provider
cross join lateral unnest(provider.capabilities) as method(payment_method)
where provider.provider_key = 'mercado_pago'
  and method.payment_method in ('pix', 'credit_card')
on conflict (
  organization_id,
  store_id,
  payment_method,
  currency,
  priority
)
do update set
  provider_id = excluded.provider_id,
  enabled = excluded.enabled,
  updated_at = now();

commit;
