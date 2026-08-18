-- Pharmacy SaaS Core v1
-- Additive foundation for gradually replacing Trier without breaking the current storefront.
-- The current site continues to read the legacy compatibility tables while the internal ERP
-- becomes the canonical operational layer domain by domain.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Tenant membership / RBAC
-- ---------------------------------------------------------------------------
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
create index if not exists tenant_memberships_tenant_idx on public.tenant_memberships(tenant_id,active);

create or replace function private.is_tenant_member(_tenant_id uuid, _user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_memberships tm
    where tm.tenant_id = _tenant_id
      and tm.user_id = _user_id
      and tm.active = true
  );
$$;

create or replace function private.has_tenant_role(_tenant_id uuid, _user_id uuid, _roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_memberships tm
    where tm.tenant_id = _tenant_id
      and tm.user_id = _user_id
      and tm.active = true
      and tm.role::text = any(_roles)
  );
$$;

revoke all on function private.is_tenant_member(uuid,uuid) from public, anon;
revoke all on function private.has_tenant_role(uuid,uuid,text[]) from public, anon;
grant execute on function private.is_tenant_member(uuid,uuid) to authenticated;
grant execute on function private.has_tenant_role(uuid,uuid,text[]) to authenticated;

-- Seed current staff into the single existing tenant without changing auth/user_roles.
insert into public.tenant_memberships(tenant_id,user_id,role,store_id)
select t.id, ur.user_id, 'admin'::public.tenant_member_role, null
from public.tenants t
join public.user_roles ur on ur.role::text = 'admin'
where t.active = true
on conflict do nothing;

insert into public.tenant_memberships(tenant_id,user_id,role,store_id)
select t.id, ur.user_id, 'seller'::public.tenant_member_role, s.id
from public.tenants t
join public.stores s on s.tenant_id=t.id and s.active=true
join public.user_roles ur on ur.role::text = 'seller'
where t.active = true
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Tenant/domain routing for future SaaS storefronts
-- ---------------------------------------------------------------------------
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
create index if not exists tenant_domains_tenant_idx on public.tenant_domains(tenant_id,active);

insert into public.tenant_domains(tenant_id,domain,is_primary,active,verified_at)
select id,'atacadaodosmedicamentos.com.br',true,true,now()
from public.tenants
where slug='atacadao-dos-medicamentos'
on conflict do nothing;

-- Keep legal identity on the store as well as the storefront settings.
update public.stores s
set cnpj = coalesce(s.cnpj, ss.cnpj),
    legal_name = coalesce(s.legal_name, ss.legal_name),
    address = coalesce(s.address, ss.address),
    updated_at = now()
from public.store_settings ss
where ss.id=1
  and (select count(*) from public.stores)=1;

-- ---------------------------------------------------------------------------
-- Product ownership: shared canonical catalog + tenant/store operational state
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_products (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  internal_sku text null,
  enabled boolean not null default true,
  sellable boolean not null default true,
  ecommerce_enabled boolean not null default true,
  catalog_source text not null default 'internal' check (catalog_source in ('internal','external','manual','migration')),
  pricing_source text not null default 'external' check (pricing_source in ('internal','external','manual','migration')),
  inventory_source text not null default 'external' check (inventory_source in ('internal','external','manual','migration')),
  migration_state text not null default 'shadow' check (migration_state in ('external_primary','shadow','dual_write','internal_primary','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id,product_id)
);
create index if not exists tenant_products_product_idx on public.tenant_products(product_id);
create index if not exists tenant_products_state_idx on public.tenant_products(tenant_id,migration_state,enabled);

insert into public.tenant_products(
  tenant_id,product_id,internal_sku,enabled,sellable,ecommerce_enabled,
  catalog_source,pricing_source,inventory_source,migration_state
)
select t.id,p.id,coalesce(p.sku,p.trier_product_id),
       coalesce(p.active,true),
       (coalesce(p.price,0)>0),
       coalesce(p.ecommerce_enabled,false),
       case when p.source='trier' or p.trier_product_id is not null then 'external' else 'internal' end,
       case when p.price_origin='trier' then 'external' else 'internal' end,
       case when p.stock_origin='trier' then 'external' else 'internal' end,
       case when p.trier_product_id is not null then 'external_primary' else 'internal_primary' end
from public.tenants t cross join public.products p
where t.slug='atacadao-dos-medicamentos'
on conflict (tenant_id,product_id) do nothing;

create table if not exists public.store_product_prices (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  cost_price numeric(14,4) null,
  base_price numeric(14,4) not null default 0 check (base_price >= 0),
  site_price numeric(14,4) null check (site_price is null or site_price >= 0),
  pdv_price numeric(14,4) null check (pdv_price is null or pdv_price >= 0),
  whatsapp_price numeric(14,4) null check (whatsapp_price is null or whatsapp_price >= 0),
  promo_price numeric(14,4) null check (promo_price is null or promo_price >= 0),
  max_discount_percent numeric(7,3) null,
  source text not null default 'migration' check (source in ('internal','external','manual','migration')),
  locked boolean not null default false,
  effective_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id,store_id,product_id)
);
create index if not exists store_product_prices_product_idx on public.store_product_prices(product_id);

insert into public.store_product_prices(
  tenant_id,store_id,product_id,cost_price,base_price,site_price,pdv_price,whatsapp_price,promo_price,max_discount_percent,source,locked
)
select t.id,s.id,p.id,null,
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
on conflict (tenant_id,store_id,product_id) do nothing;

-- ---------------------------------------------------------------------------
-- Canonical per-store inventory (independent from ERP connectors)
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_balances (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  on_hand numeric(14,3) not null default 0 check (on_hand >= 0),
  reserved numeric(14,3) not null default 0 check (reserved >= 0 and reserved <= on_hand),
  available numeric(14,3) generated always as (on_hand-reserved) stored,
  minimum_stock numeric(14,3) null,
  source text not null default 'migration' check (source in ('internal','external','manual','migration')),
  last_counted_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id,store_id,product_id)
);
create index if not exists inventory_balances_product_idx on public.inventory_balances(product_id);
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
create unique index if not exists inventory_lots_batch_uq on public.inventory_lots(tenant_id,store_id,product_id,batch_number,expiry_date);

create table if not exists public.inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  lot_id uuid null references public.inventory_lots(id) on delete restrict,
  movement_type text not null check (movement_type in (
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
  check (on_hand_delta <> 0 or reserved_delta <> 0)
);
create unique index if not exists inventory_ledger_idempotency_uq
  on public.inventory_ledger(tenant_id,store_id,idempotency_key) where idempotency_key is not null;
create index if not exists inventory_ledger_product_time_idx
  on public.inventory_ledger(tenant_id,store_id,product_id,created_at desc);
create index if not exists inventory_ledger_source_idx on public.inventory_ledger(source_type,source_id);

-- Initial snapshot from the current catalog. This is a migration opening balance only;
-- after cutover, all stock changes must enter through inventory_ledger.
insert into public.inventory_balances(tenant_id,store_id,product_id,on_hand,reserved,minimum_stock,source)
select t.id,s.id,p.id,
       greatest(coalesce(p.stock,p.stock_quantity,p.trier_stock_quantity,0),0)::numeric,
       0,
       p.minimum_stock,
       case when p.stock_origin='trier' then 'external' else 'migration' end
from public.tenants t
join public.stores s on s.tenant_id=t.id and s.active=true
cross join public.products p
where t.slug='atacadao-dos-medicamentos'
on conflict (tenant_id,store_id,product_id) do nothing;

insert into public.inventory_ledger(
  tenant_id,store_id,product_id,movement_type,on_hand_delta,reserved_delta,source_type,source_id,reference,idempotency_key,metadata
)
select ib.tenant_id,ib.store_id,ib.product_id,'opening',ib.on_hand,0,
       'migration','saas-core-v1','Saldo inicial importado do catálogo atual',
       'opening:'||ib.product_id::text,
       jsonb_build_object('source',ib.source,'snapshot_at',now())
from public.inventory_balances ib
where ib.on_hand > 0
on conflict do nothing;

create or replace function private.apply_inventory_ledger_balance()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_on_hand numeric;
  v_reserved numeric;
begin
  insert into public.inventory_balances(tenant_id,store_id,product_id,on_hand,reserved,source,updated_at)
  values(new.tenant_id,new.store_id,new.product_id,new.on_hand_delta,new.reserved_delta,'internal',now())
  on conflict (tenant_id,store_id,product_id)
  do update set
    on_hand = public.inventory_balances.on_hand + excluded.on_hand,
    reserved = public.inventory_balances.reserved + excluded.reserved,
    source = 'internal',
    updated_at = now()
  returning on_hand,reserved into v_on_hand,v_reserved;

  if v_on_hand < 0 then
    raise exception 'Estoque negativo não permitido para produto %', new.product_id;
  end if;
  if v_reserved < 0 or v_reserved > v_on_hand then
    raise exception 'Reserva inválida para produto %', new.product_id;
  end if;
  return new;
end;
$$;
revoke all on function private.apply_inventory_ledger_balance() from public, anon, authenticated;

create trigger trg_inventory_ledger_apply_balance
after insert on public.inventory_ledger
for each row execute function private.apply_inventory_ledger_balance();

-- ---------------------------------------------------------------------------
-- Regulatory product master / prescription & dispensing traceability
-- ---------------------------------------------------------------------------
create table if not exists public.product_regulatory (
  product_id uuid primary key references public.products(id) on delete cascade,
  anvisa_registration_number text null,
  presentation text null,
  registry_holder text null,
  dcb text null,
  sanitary_classification text null,
  prescription_type text null,
  controlled_list text null,
  requires_retention boolean not null default false,
  sngpc_required boolean not null default false,
  sncr_applicable boolean not null default false,
  thermolabile boolean not null default false,
  min_storage_temp_c numeric(5,2) null,
  max_storage_temp_c numeric(5,2) null,
  remote_delivery_allowed boolean not null default true,
  ecommerce_display_mode text not null default 'normal' check (ecommerce_display_mode in ('normal','neutral_price_list','prescription_only','blocked')),
  source text not null default 'internal',
  verified_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.product_regulatory(
  product_id,dcb,prescription_type,controlled_list,requires_retention,sngpc_required,ecommerce_display_mode,source
)
select p.id,p.active_ingredient,p.tarja,p.medicine_list_type,
       coalesce(p.requires_prescription,false),
       coalesce(p.controlled,false) or nullif(trim(coalesce(p.medicine_list_type,'')),'') is not null,
       case
         when coalesce(p.controlled,false) then 'prescription_only'
         when coalesce(p.requires_prescription,false) then 'neutral_price_list'
         else 'normal'
       end,
       case when p.trier_product_id is not null then 'migration' else 'internal' end
from public.products p
on conflict (product_id) do nothing;

-- Add tenant/store context to current transactional tables without breaking old clients.
alter table public.orders add column if not exists tenant_id uuid null references public.tenants(id);
alter table public.orders add column if not exists store_id uuid null references public.stores(id);
alter table public.prescriptions add column if not exists tenant_id uuid null references public.tenants(id);
alter table public.prescriptions add column if not exists store_id uuid null references public.stores(id);
alter table public.stock_movements add column if not exists tenant_id uuid null references public.tenants(id);
alter table public.stock_movements add column if not exists store_id uuid null references public.stores(id);

create or replace function private.default_single_tenant()
returns uuid
language sql stable security definer
set search_path=''
as $$
  select case when count(*)=1 then min(id) else null end
  from public.tenants where active=true;
$$;
create or replace function private.default_single_store(_tenant_id uuid)
returns uuid
language sql stable security definer
set search_path=''
as $$
  select case when count(*)=1 then min(id) else null end
  from public.stores where tenant_id=_tenant_id and active=true;
$$;
revoke all on function private.default_single_tenant() from public,anon,authenticated;
revoke all on function private.default_single_store(uuid) from public,anon,authenticated;

create or replace function private.assign_transaction_context()
returns trigger
language plpgsql security definer
set search_path=''
as $$
begin
  if new.tenant_id is null then new.tenant_id := private.default_single_tenant(); end if;
  if new.store_id is null and new.tenant_id is not null then new.store_id := private.default_single_store(new.tenant_id); end if;
  return new;
end;
$$;
revoke all on function private.assign_transaction_context() from public,anon,authenticated;

drop trigger if exists trg_orders_assign_tenant on public.orders;
create trigger trg_orders_assign_tenant before insert on public.orders for each row execute function private.assign_transaction_context();
drop trigger if exists trg_prescriptions_assign_tenant on public.prescriptions;
create trigger trg_prescriptions_assign_tenant before insert on public.prescriptions for each row execute function private.assign_transaction_context();
drop trigger if exists trg_stock_movements_assign_tenant on public.stock_movements;
create trigger trg_stock_movements_assign_tenant before insert on public.stock_movements for each row execute function private.assign_transaction_context();

update public.orders o set tenant_id=private.default_single_tenant() where tenant_id is null;
update public.orders o set store_id=private.default_single_store(o.tenant_id) where store_id is null and tenant_id is not null;
update public.prescriptions p set tenant_id=private.default_single_tenant() where tenant_id is null;
update public.prescriptions p set store_id=private.default_single_store(p.tenant_id) where store_id is null and tenant_id is not null;
update public.stock_movements sm set tenant_id=private.default_single_tenant() where tenant_id is null;
update public.stock_movements sm set store_id=private.default_single_store(sm.tenant_id) where store_id is null and tenant_id is not null;

create table if not exists public.prescription_regulatory (
  prescription_id uuid primary key references public.prescriptions(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  prescription_type text null,
  document_number text null,
  sncr_number text null,
  issued_at timestamptz null,
  valid_until timestamptz null,
  prescriber_name text null,
  prescriber_council text null,
  prescriber_council_number text null,
  prescriber_uf text null,
  retained_at timestamptz null,
  verified_at timestamptz null,
  verified_by uuid null references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prescription_audit_events (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  event_type text not null,
  old_status text null,
  new_status text null,
  actor_id uuid null references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists prescription_audit_events_idx on public.prescription_audit_events(prescription_id,created_at desc);

create table if not exists public.dispensations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  prescription_id uuid null references public.prescriptions(id) on delete restrict,
  order_id uuid null references public.orders(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','approved','dispensed','cancelled')),
  pharmacist_id uuid null references auth.users(id),
  approved_at timestamptz null,
  dispensed_at timestamptz null,
  retention_confirmed boolean not null default false,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dispensations_prescription_idx on public.dispensations(prescription_id);

create table if not exists public.dispensation_items (
  id uuid primary key default gen_random_uuid(),
  dispensation_id uuid not null references public.dispensations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  lot_id uuid null references public.inventory_lots(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity>0),
  sngpc_required boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.regulatory_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  system text not null check (system in ('sngpc','sncr','other')),
  entity_type text not null,
  entity_id uuid null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  payload_hash text null,
  status text not null default 'pending' check (status in ('pending','sending','accepted','rejected','retry','cancelled')),
  protocol text null,
  response_masked jsonb null,
  attempts integer not null default 0,
  next_attempt_at timestamptz null,
  submitted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,store_id,system,idempotency_key)
);
create index if not exists regulatory_submissions_queue_idx on public.regulatory_submissions(status,next_attempt_at,created_at);

-- ---------------------------------------------------------------------------
-- Fiscal foundation (SEFAZ adapter will be implemented in a later phase)
-- ---------------------------------------------------------------------------
create table if not exists public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  order_id uuid null references public.orders(id) on delete restrict,
  pos_sale_id uuid null references public.pos_sales(id) on delete restrict,
  model text not null check (model in ('nfe','nfce')),
  series text null,
  number bigint null,
  access_key text null,
  status text not null default 'draft' check (status in ('draft','queued','authorized','rejected','cancelled','contingency','error')),
  protocol text null,
  xml_storage_path text null,
  danfe_storage_path text null,
  issued_at timestamptz null,
  cancelled_at timestamptz null,
  rejection_code text null,
  rejection_message text null,
  provider text not null default 'internal',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists fiscal_documents_access_key_uq on public.fiscal_documents(access_key) where access_key is not null;
create index if not exists fiscal_documents_order_idx on public.fiscal_documents(order_id);

create table if not exists public.fiscal_events (
  id uuid primary key default gen_random_uuid(),
  fiscal_document_id uuid not null references public.fiscal_documents(id) on delete cascade,
  event_type text not null,
  status text not null,
  protocol text null,
  payload_masked jsonb null,
  response_masked jsonb null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Generic connector framework: Trier becomes only one adapter/provider
-- ---------------------------------------------------------------------------
create table if not exists public.integration_connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid null references public.stores(id) on delete cascade,
  provider text not null,
  connector_type text not null,
  status text not null default 'active' check (status in ('active','paused','error','retired')),
  mode text not null default 'shadow' check (mode in ('external_primary','shadow','dual_write','internal_primary','retired')),
  config jsonb not null default '{}'::jsonb,
  last_health_at timestamptz null,
  last_health_status text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,store_id,provider,connector_type)
);

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
create unique index if not exists external_entity_mapping_uq
  on public.external_entity_mappings(tenant_id,provider,entity_type,external_id);
create index if not exists external_entity_internal_idx
  on public.external_entity_mappings(tenant_id,entity_type,internal_id);

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
  status text not null default 'pending' check (status in ('pending','processing','sent','retry','failed','cancelled')),
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
  status text not null default 'received' check (status in ('received','processed','ignored','error')),
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
  migration_state text not null check (migration_state in ('external_primary','shadow','dual_write','internal_primary','building','retired')),
  external_provider text null,
  notes text null,
  updated_at timestamptz not null default now(),
  unique(tenant_id,store_id,domain)
);

insert into public.integration_connectors(tenant_id,store_id,provider,connector_type,status,mode,config)
select t.id,s.id,'trier','erp','active','shadow',jsonb_build_object('legacy_connector',true,'secrets','vault')
from public.tenants t join public.stores s on s.tenant_id=t.id
where t.slug='atacadao-dos-medicamentos'
on conflict (tenant_id,store_id,provider,connector_type) do nothing;

insert into public.external_entity_mappings(tenant_id,store_id,provider,entity_type,external_id,internal_id,external_barcode,last_synced_at)
select t.id,s.id,'trier','product',m.trier_product_id,m.product_id,m.trier_barcode,m.last_synced_at
from public.tenants t
join public.stores s on s.tenant_id=t.id and s.active=true
cross join public.trier_product_mappings m
where t.slug='atacadao-dos-medicamentos' and m.product_id is not null
on conflict (tenant_id,provider,entity_type,external_id) do nothing;

insert into public.integration_domain_ownership(tenant_id,store_id,domain,migration_state,external_provider,notes)
select t.id,s.id,v.domain,v.state,v.provider,v.notes
from public.tenants t
join public.stores s on s.tenant_id=t.id and s.active=true
cross join (values
  ('catalog','external_primary','trier','Catálogo atual ainda espelhado do ERP; cadastro interno já criado.'),
  ('inventory','external_primary','trier','Estoque canônico interno criado em shadow; Trier ainda alimenta a operação atual.'),
  ('pricing','external_primary','trier','Tabela própria de preços criada; Trier ainda é origem operacional.'),
  ('orders','dual_write','trier','Pedido nasce no nosso sistema e ainda é espelhado ao Trier.'),
  ('payments','internal_primary',null,'Pagamentos já são controlados pelo nosso sistema/gateways.'),
  ('prescriptions','internal_primary',null,'Receitas e aprovação já são controladas internamente.'),
  ('pos','internal_primary',null,'PDV próprio já possui base transacional independente.'),
  ('fiscal','external_primary','trier','Emissão fiscal própria será o próximo domínio crítico.'),
  ('sngpc','external_primary','trier','Escrituração SNGPC própria será implementada antes da aposentadoria do ERP.'),
  ('sncr','building',null,'Base regulatória pronta para integração quando o fluxo de farmácias estiver disponível.')
) as v(domain,state,provider,notes)
where t.slug='atacadao-dos-medicamentos'
on conflict (tenant_id,store_id,domain) do update
set migration_state=excluded.migration_state,external_provider=excluded.external_provider,notes=excluded.notes,updated_at=now();

-- ---------------------------------------------------------------------------
-- RLS: tenant isolation. Internal queues are service-role only.
-- ---------------------------------------------------------------------------
alter table public.tenant_memberships enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.tenant_products enable row level security;
alter table public.store_product_prices enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_ledger enable row level security;
alter table public.product_regulatory enable row level security;
alter table public.prescription_regulatory enable row level security;
alter table public.prescription_audit_events enable row level security;
alter table public.dispensations enable row level security;
alter table public.dispensation_items enable row level security;
alter table public.regulatory_submissions enable row level security;
alter table public.fiscal_documents enable row level security;
alter table public.fiscal_events enable row level security;
alter table public.integration_connectors enable row level security;
alter table public.external_entity_mappings enable row level security;
alter table public.integration_outbox enable row level security;
alter table public.integration_inbox enable row level security;
alter table public.integration_domain_ownership enable row level security;

create policy tenant_memberships_read_own on public.tenant_memberships
for select to authenticated
using (user_id=auth.uid() or private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager']));
create policy tenant_memberships_manage_admin on public.tenant_memberships
for all to authenticated
using (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin']))
with check (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin']));

create policy tenant_domains_public_read on public.tenant_domains
for select to anon,authenticated using (active=true);
create policy tenant_domains_manage_admin on public.tenant_domains
for all to authenticated
using (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin']))
with check (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin']));

create policy tenant_products_member_read on public.tenant_products
for select to authenticated using (private.is_tenant_member(tenant_id,auth.uid()));
create policy store_product_prices_member_read on public.store_product_prices
for select to authenticated using (private.is_tenant_member(tenant_id,auth.uid()));
create policy inventory_balances_member_read on public.inventory_balances
for select to authenticated using (private.is_tenant_member(tenant_id,auth.uid()));
create policy inventory_lots_member_read on public.inventory_lots
for select to authenticated using (private.is_tenant_member(tenant_id,auth.uid()));
create policy inventory_ledger_member_read on public.inventory_ledger
for select to authenticated using (private.is_tenant_member(tenant_id,auth.uid()));

create policy product_regulatory_staff_read on public.product_regulatory
for select to authenticated
using (exists (
  select 1 from public.tenant_products tp
  where tp.product_id=product_regulatory.product_id
    and private.is_tenant_member(tp.tenant_id,auth.uid())
));

create policy prescription_regulatory_authorized_read on public.prescription_regulatory
for select to authenticated using (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist']));
create policy prescription_audit_authorized_read on public.prescription_audit_events
for select to authenticated using (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist','auditor']));
create policy dispensations_authorized_read on public.dispensations
for select to authenticated using (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist','auditor']));
create policy dispensation_items_authorized_read on public.dispensation_items
for select to authenticated using (exists (
  select 1 from public.dispensations d where d.id=dispensation_items.dispensation_id
  and private.has_tenant_role(d.tenant_id,auth.uid(),array['owner','admin','manager','pharmacist','auditor'])
));
create policy regulatory_submissions_authorized_read on public.regulatory_submissions
for select to authenticated using (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist','auditor']));

create policy fiscal_documents_authorized_read on public.fiscal_documents
for select to authenticated using (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','finance','auditor']));
create policy fiscal_events_authorized_read on public.fiscal_events
for select to authenticated using (exists (
  select 1 from public.fiscal_documents fd where fd.id=fiscal_events.fiscal_document_id
  and private.has_tenant_role(fd.tenant_id,auth.uid(),array['owner','admin','manager','finance','auditor'])
));

create policy integration_connectors_admin_read on public.integration_connectors
for select to authenticated using (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','auditor']));
create policy external_entity_mappings_admin_read on public.external_entity_mappings
for select to authenticated using (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','auditor']));
create policy integration_domain_ownership_admin_read on public.integration_domain_ownership
for select to authenticated using (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','auditor']));

-- Explicit client deny on integration/regulatory write queues. Service role bypasses RLS.
create policy integration_outbox_client_deny on public.integration_outbox
for all to anon,authenticated using(false) with check(false);
create policy integration_inbox_client_deny on public.integration_inbox
for all to anon,authenticated using(false) with check(false);

create or replace view public.saas_migration_status
with (security_invoker=true)
as
select ido.tenant_id,ido.store_id,ido.domain,ido.migration_state,ido.external_provider,ido.notes,ido.updated_at
from public.integration_domain_ownership ido;

grant select on public.saas_migration_status to authenticated;

comment on table public.tenant_products is 'Tenant-level product activation/ownership. products remains the shared canonical product registry.';
comment on table public.inventory_ledger is 'Immutable canonical stock movement ledger. Trier or any ERP is only an external adapter.';
comment on table public.integration_domain_ownership is 'Per-domain migration switch used to retire external ERP dependencies safely.';
comment on table public.regulatory_submissions is 'Generic reliable queue/history for SNGPC, SNCR and future sanitary integrations.';
comment on table public.fiscal_documents is 'Internal fiscal document aggregate; SEFAZ authorization adapter will populate protocol/XML/status.';
