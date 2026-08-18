-- Pharmacy SaaS Foundation
-- Additive only. Keeps the current storefront/ERP flow working while the internal platform is built in parallel.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

do $$ begin
  create type public.tenant_member_role as enum (
    'owner','admin','manager','pharmacist','cashier','seller','inventory','finance','auditor'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.tenant_member_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tenant_memberships_tenant_user_role_uq
  on public.tenant_memberships(tenant_id,user_id,role) where store_id is null;
create unique index if not exists tenant_memberships_store_user_role_uq
  on public.tenant_memberships(tenant_id,store_id,user_id,role) where store_id is not null;
create index if not exists tenant_memberships_user_idx on public.tenant_memberships(user_id,active);

create or replace function private.is_tenant_member(_tenant_id uuid,_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.tenant_memberships tm
    where tm.tenant_id=_tenant_id and tm.user_id=_user_id and tm.active=true
  );
$$;
create or replace function private.has_tenant_role(_tenant_id uuid,_user_id uuid,_roles text[])
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.tenant_memberships tm
    where tm.tenant_id=_tenant_id and tm.user_id=_user_id and tm.active=true
      and tm.role::text=any(_roles)
  );
$$;
revoke all on function private.is_tenant_member(uuid,uuid) from public,anon;
revoke all on function private.has_tenant_role(uuid,uuid,text[]) from public,anon;
grant execute on function private.is_tenant_member(uuid,uuid) to authenticated;
grant execute on function private.has_tenant_role(uuid,uuid,text[]) to authenticated;

-- Current staff -> current tenant. Existing user_roles remains untouched for compatibility.
insert into public.tenant_memberships(tenant_id,user_id,role,store_id)
select t.id,ur.user_id,'admin'::public.tenant_member_role,null
from public.tenants t join public.user_roles ur on ur.role::text='admin'
where t.active=true
on conflict do nothing;

insert into public.tenant_memberships(tenant_id,user_id,role,store_id)
select t.id,ur.user_id,'seller'::public.tenant_member_role,s.id
from public.tenants t
join public.stores s on s.tenant_id=t.id and s.active=true
join public.user_roles ur on ur.role::text='seller'
where t.active=true
on conflict do nothing;

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  domain text not null,
  is_primary boolean not null default false,
  active boolean not null default true,
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tenant_domains_domain_uq on public.tenant_domains(lower(domain));
insert into public.tenant_domains(tenant_id,domain,is_primary,active,verified_at)
select id,'atacadaodosmedicamentos.com.br',true,true,now()
from public.tenants where slug='atacadao-dos-medicamentos'
on conflict do nothing;

update public.stores s
set cnpj=coalesce(s.cnpj,ss.cnpj),
    legal_name=coalesce(s.legal_name,ss.legal_name),
    address=coalesce(s.address,ss.address),
    updated_at=now()
from public.store_settings ss
where ss.id=1 and (select count(*) from public.stores)=1;

-- Shared product identity + tenant ownership/configuration.
create table if not exists public.tenant_products (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  internal_sku text null,
  enabled boolean not null default true,
  sellable boolean not null default true,
  ecommerce_enabled boolean not null default true,
  catalog_source text not null default 'internal' check(catalog_source in ('internal','external','manual','migration')),
  pricing_source text not null default 'external' check(pricing_source in ('internal','external','manual','migration')),
  inventory_source text not null default 'external' check(inventory_source in ('internal','external','manual','migration')),
  migration_state text not null default 'shadow' check(migration_state in ('external_primary','shadow','dual_write','internal_primary','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,product_id)
);
create index if not exists tenant_products_state_idx on public.tenant_products(tenant_id,migration_state,enabled);
create index if not exists tenant_products_product_idx on public.tenant_products(product_id);

insert into public.tenant_products(
  tenant_id,product_id,internal_sku,enabled,sellable,ecommerce_enabled,
  catalog_source,pricing_source,inventory_source,migration_state
)
select t.id,p.id,coalesce(p.sku,p.trier_product_id),
       coalesce(p.active,true),coalesce(p.price,0)>0,coalesce(p.ecommerce_enabled,false),
       case when p.trier_product_id is not null then 'external' else 'internal' end,
       case when p.price_origin='trier' then 'external' else 'internal' end,
       case when p.stock_origin='trier' then 'external' else 'internal' end,
       case when p.trier_product_id is not null then 'external_primary' else 'internal_primary' end
from public.tenants t cross join public.products p
where t.slug='atacadao-dos-medicamentos'
on conflict(tenant_id,product_id) do nothing;

create table if not exists public.store_product_prices (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  cost_price numeric(14,4) null,
  base_price numeric(14,4) not null default 0 check(base_price>=0),
  site_price numeric(14,4) null check(site_price is null or site_price>=0),
  pdv_price numeric(14,4) null check(pdv_price is null or pdv_price>=0),
  whatsapp_price numeric(14,4) null check(whatsapp_price is null or whatsapp_price>=0),
  promo_price numeric(14,4) null check(promo_price is null or promo_price>=0),
  max_discount_percent numeric(7,3) null,
  source text not null default 'migration' check(source in ('internal','external','manual','migration')),
  locked boolean not null default false,
  effective_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,store_id,product_id)
);
create index if not exists store_product_prices_product_idx on public.store_product_prices(product_id);

insert into public.store_product_prices(
  tenant_id,store_id,product_id,base_price,site_price,pdv_price,whatsapp_price,promo_price,max_discount_percent,source,locked
)
select t.id,s.id,p.id,
       greatest(coalesce(p.price_base,p.price,0),0),
       greatest(coalesce(p.site_price,p.ecommerce_price,p.price,0),0),
       greatest(coalesce(p.price_base,p.price,0),0),
       greatest(coalesce(p.whatsapp_price,p.price,0),0),
       case when coalesce(p.site_promo_price,p.promo_price) is null then null else greatest(coalesce(p.site_promo_price,p.promo_price),0) end,
       p.max_discount_percentage,
       case when p.price_origin='trier' then 'external' else 'migration' end,
       coalesce(p.lock_base_price,false)
from public.tenants t
join public.stores s on s.tenant_id=t.id and s.active=true
cross join public.products p
where t.slug='atacadao-dos-medicamentos'
on conflict(tenant_id,store_id,product_id) do nothing;

-- Canonical inventory: balance + lot/expiry + immutable ledger.
create table if not exists public.inventory_balances (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  on_hand numeric(14,3) not null default 0 check(on_hand>=0),
  reserved numeric(14,3) not null default 0 check(reserved>=0 and reserved<=on_hand),
  available numeric(14,3) generated always as(on_hand-reserved) stored,
  minimum_stock numeric(14,3) null,
  source text not null default 'migration' check(source in ('internal','external','manual','migration')),
  last_counted_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key(tenant_id,store_id,product_id)
);
create index if not exists inventory_balances_available_idx on public.inventory_balances(tenant_id,store_id,available);

create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  batch_number text not null,
  manufacture_date date null,
  expiry_date date null,
  unit_cost numeric(14,4) null,
  supplier_reference text null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inventory_lots_fefo_idx on public.inventory_lots(tenant_id,store_id,product_id,expiry_date) where active=true;

create table if not exists public.inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  lot_id uuid null references public.inventory_lots(id) on delete restrict,
  movement_type text not null check(movement_type in (
    'opening','purchase','sale','sale_return','supplier_return','adjustment','inventory_count',
    'transfer_in','transfer_out','reservation','release','loss','expiry','cancellation'
  )),
  on_hand_delta numeric(14,3) not null default 0,
  reserved_delta numeric(14,3) not null default 0,
  unit_cost numeric(14,4) null,
  source_type text null,
  source_id text null,
  reference text null,
  reason text null,
  idempotency_key text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  check(on_hand_delta<>0 or reserved_delta<>0)
);
create unique index if not exists inventory_ledger_idempotency_uq
  on public.inventory_ledger(tenant_id,store_id,idempotency_key) where idempotency_key is not null;
create index if not exists inventory_ledger_product_time_idx on public.inventory_ledger(tenant_id,store_id,product_id,created_at desc);

insert into public.inventory_balances(tenant_id,store_id,product_id,on_hand,reserved,minimum_stock,source)
select t.id,s.id,p.id,
       greatest(coalesce(p.stock,p.stock_quantity,p.trier_stock_quantity,0),0)::numeric,
       0,p.minimum_stock,
       case when p.stock_origin='trier' then 'external' else 'migration' end
from public.tenants t
join public.stores s on s.tenant_id=t.id and s.active=true
cross join public.products p
where t.slug='atacadao-dos-medicamentos'
on conflict(tenant_id,store_id,product_id) do nothing;

insert into public.inventory_ledger(
  tenant_id,store_id,product_id,movement_type,on_hand_delta,reserved_delta,
  source_type,source_id,reference,idempotency_key,metadata
)
select ib.tenant_id,ib.store_id,ib.product_id,'opening',ib.on_hand,0,
       'migration','saas-foundation','Saldo inicial importado do catálogo atual',
       'opening:'||ib.product_id::text,jsonb_build_object('source',ib.source,'snapshot_at',now())
from public.inventory_balances ib
where ib.on_hand>0
on conflict do nothing;

create or replace function private.apply_inventory_ledger_balance()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_on_hand numeric; v_reserved numeric;
begin
  insert into public.inventory_balances(tenant_id,store_id,product_id,on_hand,reserved,source,updated_at)
  values(new.tenant_id,new.store_id,new.product_id,new.on_hand_delta,new.reserved_delta,'internal',now())
  on conflict(tenant_id,store_id,product_id)
  do update set
    on_hand=public.inventory_balances.on_hand+excluded.on_hand,
    reserved=public.inventory_balances.reserved+excluded.reserved,
    source='internal',updated_at=now()
  returning on_hand,reserved into v_on_hand,v_reserved;
  if v_on_hand<0 then raise exception 'Estoque negativo não permitido para produto %',new.product_id; end if;
  if v_reserved<0 or v_reserved>v_on_hand then raise exception 'Reserva inválida para produto %',new.product_id; end if;
  return new;
end;
$$;
revoke all on function private.apply_inventory_ledger_balance() from public,anon,authenticated;
create trigger trg_inventory_ledger_apply_balance
after insert on public.inventory_ledger for each row execute function private.apply_inventory_ledger_balance();

-- Generic integration layer. Trier is just a provider from now on.
create table if not exists public.integration_connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid null references public.stores(id) on delete cascade,
  provider text not null,
  connector_type text not null,
  status text not null default 'active' check(status in ('active','paused','error','retired')),
  mode text not null default 'shadow' check(mode in ('external_primary','shadow','dual_write','internal_primary','retired')),
  config jsonb not null default '{}'::jsonb,
  last_health_at timestamptz null,
  last_health_status text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists integration_connectors_uq
  on public.integration_connectors(tenant_id,coalesce(store_id,'00000000-0000-0000-0000-000000000000'::uuid),provider,connector_type);

create table if not exists public.external_entity_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid null references public.stores(id) on delete cascade,
  provider text not null,
  entity_type text not null,
  external_id text not null,
  internal_id uuid not null,
  external_barcode text null,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists external_entity_mapping_uq on public.external_entity_mappings(tenant_id,provider,entity_type,external_id);
create index if not exists external_entity_internal_idx on public.external_entity_mappings(tenant_id,entity_type,internal_id);

create table if not exists public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid null references public.stores(id) on delete cascade,
  topic text not null,
  aggregate_type text not null,
  aggregate_id uuid null,
  target_provider text null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','processing','sent','retry','failed','cancelled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  processed_at timestamptz null,
  unique(tenant_id,idempotency_key)
);
create index if not exists integration_outbox_queue_idx on public.integration_outbox(status,next_attempt_at,created_at);

create table if not exists public.integration_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid null references public.stores(id) on delete cascade,
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check(status in ('received','processed','ignored','error')),
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  error_message text null,
  unique(tenant_id,provider,external_event_id)
);

create table if not exists public.integration_domain_ownership (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  domain text not null,
  migration_state text not null check(migration_state in ('external_primary','shadow','dual_write','internal_primary','building','retired')),
  external_provider text null,
  notes text null,
  updated_at timestamptz not null default now(),
  unique(tenant_id,store_id,domain)
);

insert into public.integration_connectors(tenant_id,store_id,provider,connector_type,status,mode,config)
select t.id,s.id,'trier','erp','active','shadow',jsonb_build_object('legacy_connector',true,'secrets','vault')
from public.tenants t join public.stores s on s.tenant_id=t.id
where t.slug='atacadao-dos-medicamentos'
on conflict do nothing;

insert into public.external_entity_mappings(
  tenant_id,store_id,provider,entity_type,external_id,internal_id,external_barcode,last_synced_at
)
select t.id,s.id,'trier','product',m.trier_product_id,m.product_id,m.trier_barcode,m.last_synced_at
from public.tenants t
join public.stores s on s.tenant_id=t.id and s.active=true
cross join public.trier_product_mappings m
where t.slug='atacadao-dos-medicamentos' and m.product_id is not null
on conflict(tenant_id,provider,entity_type,external_id) do nothing;

insert into public.integration_domain_ownership(tenant_id,store_id,domain,migration_state,external_provider,notes)
select t.id,s.id,v.domain,v.state,v.provider,v.notes
from public.tenants t
join public.stores s on s.tenant_id=t.id and s.active=true
cross join(values
  ('catalog','external_primary','trier','Catálogo interno existe, mas o ERP ainda alimenta a operação.'),
  ('inventory','shadow','trier','Saldo interno por loja criado e reconciliado; ERP ainda atualiza o site atual.'),
  ('pricing','shadow','trier','Preço interno por loja criado; ERP ainda é origem operacional.'),
  ('orders','dual_write','trier','Pedido nasce no nosso sistema e ainda é espelhado ao ERP.'),
  ('payments','internal_primary',null,'Pagamento já é controlado por gateways do nosso sistema.'),
  ('prescriptions','internal_primary',null,'Receitas e aprovação já são controladas internamente.'),
  ('pos','internal_primary',null,'Base de PDV própria já existe.'),
  ('fiscal','external_primary','trier','Emissão fiscal própria ainda será implementada.'),
  ('sngpc','external_primary','trier','SNGPC próprio ainda será implementado.'),
  ('sncr','building',null,'Integração regulatória em construção conforme cronograma da Anvisa.')
) as v(domain,state,provider,notes)
where t.slug='atacadao-dos-medicamentos'
on conflict(tenant_id,store_id,domain) do update
set migration_state=excluded.migration_state,external_provider=excluded.external_provider,notes=excluded.notes,updated_at=now();

-- RLS for new SaaS tables.
alter table public.tenant_memberships enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.tenant_products enable row level security;
alter table public.store_product_prices enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_ledger enable row level security;
alter table public.integration_connectors enable row level security;
alter table public.external_entity_mappings enable row level security;
alter table public.integration_outbox enable row level security;
alter table public.integration_inbox enable row level security;
alter table public.integration_domain_ownership enable row level security;

create policy tenant_memberships_read_own on public.tenant_memberships
for select to authenticated
using(user_id=auth.uid() or private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager']));
create policy tenant_memberships_manage_admin on public.tenant_memberships
for all to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin']))
with check(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin']));

create policy tenant_domains_public_read on public.tenant_domains for select to anon,authenticated using(active=true);
create policy tenant_domains_manage_admin on public.tenant_domains
for all to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin']))
with check(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin']));

create policy tenant_products_member_read on public.tenant_products for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));
create policy store_product_prices_member_read on public.store_product_prices for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));
create policy inventory_balances_member_read on public.inventory_balances for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));
create policy inventory_lots_member_read on public.inventory_lots for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));
create policy inventory_ledger_member_read on public.inventory_ledger for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));
create policy integration_connectors_admin_read on public.integration_connectors for select to authenticated using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','auditor']));
create policy external_entity_mappings_admin_read on public.external_entity_mappings for select to authenticated using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','auditor']));
create policy integration_domain_ownership_admin_read on public.integration_domain_ownership for select to authenticated using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','auditor']));
create policy integration_outbox_client_deny on public.integration_outbox for all to anon,authenticated using(false) with check(false);
create policy integration_inbox_client_deny on public.integration_inbox for all to anon,authenticated using(false) with check(false);

create or replace view public.saas_migration_status
with(security_invoker=true)
as select tenant_id,store_id,domain,migration_state,external_provider,notes,updated_at
from public.integration_domain_ownership;
grant select on public.saas_migration_status to authenticated;

comment on table public.tenant_products is 'Tenant product ownership/configuration; products remains the shared product identity registry.';
comment on table public.inventory_ledger is 'Immutable canonical inventory ledger. External ERPs are adapters only.';
comment on table public.integration_domain_ownership is 'Domain-by-domain cutover state used to retire external ERP dependencies safely.';
