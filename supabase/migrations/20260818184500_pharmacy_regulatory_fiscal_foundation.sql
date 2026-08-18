-- Pharmacy Regulatory + Fiscal Foundation
-- Staging-first additive layer for a pharmacy ERP independent from Trier.

-- ---------------------------------------------------------------------------
-- Product sanitary/regulatory master
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
  ecommerce_display_mode text not null default 'normal'
    check(ecommerce_display_mode in ('normal','neutral_price_list','prescription_only','blocked')),
  source text not null default 'internal' check(source in ('internal','migration','manual','external')),
  verified_at timestamptz null,
  verified_by uuid null references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.product_regulatory(
  product_id,dcb,prescription_type,controlled_list,requires_retention,sngpc_required,
  ecommerce_display_mode,source
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
on conflict(product_id) do nothing;

create index if not exists product_regulatory_sngpc_idx on public.product_regulatory(sngpc_required) where sngpc_required=true;
create index if not exists product_regulatory_display_idx on public.product_regulatory(ecommerce_display_mode);

-- ---------------------------------------------------------------------------
-- Make legacy transactional records tenant/store aware without breaking clients.
-- Auto-default happens only while exactly one active tenant/store exists.
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists tenant_id uuid null references public.tenants(id);
alter table public.orders add column if not exists store_id uuid null references public.stores(id);
alter table public.prescriptions add column if not exists tenant_id uuid null references public.tenants(id);
alter table public.prescriptions add column if not exists store_id uuid null references public.stores(id);
alter table public.stock_movements add column if not exists tenant_id uuid null references public.tenants(id);
alter table public.stock_movements add column if not exists store_id uuid null references public.stores(id);

create index if not exists orders_tenant_store_idx on public.orders(tenant_id,store_id,created_at desc);
create index if not exists prescriptions_tenant_store_idx on public.prescriptions(tenant_id,store_id,created_at desc);
create index if not exists stock_movements_tenant_store_idx on public.stock_movements(tenant_id,store_id,created_at desc);

create or replace function private.default_single_tenant()
returns uuid language sql stable security definer set search_path=''
as $$
  select case when count(*)=1 then (array_agg(id))[1] else null end
  from public.tenants where active=true;
$$;

create or replace function private.default_single_store(_tenant_id uuid)
returns uuid language sql stable security definer set search_path=''
as $$
  select case when count(*)=1 then (array_agg(id))[1] else null end
  from public.stores where tenant_id=_tenant_id and active=true;
$$;
revoke all on function private.default_single_tenant() from public,anon,authenticated;
revoke all on function private.default_single_store(uuid) from public,anon,authenticated;

create or replace function private.assign_transaction_context()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.tenant_id is null then new.tenant_id:=private.default_single_tenant(); end if;
  if new.store_id is null and new.tenant_id is not null then new.store_id:=private.default_single_store(new.tenant_id); end if;
  return new;
end;
$$;
revoke all on function private.assign_transaction_context() from public,anon,authenticated;

drop trigger if exists trg_orders_assign_tenant on public.orders;
create trigger trg_orders_assign_tenant before insert on public.orders
for each row execute function private.assign_transaction_context();
drop trigger if exists trg_prescriptions_assign_tenant on public.prescriptions;
create trigger trg_prescriptions_assign_tenant before insert on public.prescriptions
for each row execute function private.assign_transaction_context();
drop trigger if exists trg_stock_movements_assign_tenant on public.stock_movements;
create trigger trg_stock_movements_assign_tenant before insert on public.stock_movements
for each row execute function private.assign_transaction_context();

update public.orders set tenant_id=private.default_single_tenant() where tenant_id is null;
update public.orders set store_id=private.default_single_store(tenant_id) where tenant_id is not null and store_id is null;
update public.prescriptions set tenant_id=private.default_single_tenant() where tenant_id is null;
update public.prescriptions set store_id=private.default_single_store(tenant_id) where tenant_id is not null and store_id is null;
update public.stock_movements set tenant_id=private.default_single_tenant() where tenant_id is null;
update public.stock_movements set store_id=private.default_single_store(tenant_id) where tenant_id is not null and store_id is null;

-- ---------------------------------------------------------------------------
-- Prescription regulatory data and immutable audit trail
-- ---------------------------------------------------------------------------
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
  patient_document_masked text null,
  retained_at timestamptz null,
  verified_at timestamptz null,
  verified_by uuid null references auth.users(id),
  authenticity_status text not null default 'pending'
    check(authenticity_status in ('pending','verified','invalid','not_applicable')),
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

create or replace function private.audit_prescription_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='INSERT' then
    insert into public.prescription_audit_events(prescription_id,tenant_id,store_id,event_type,new_status,actor_id)
    values(new.id,new.tenant_id,new.store_id,'received',new.status,auth.uid());
  elsif old.status is distinct from new.status then
    insert into public.prescription_audit_events(prescription_id,tenant_id,store_id,event_type,old_status,new_status,actor_id)
    values(new.id,new.tenant_id,new.store_id,'status_changed',old.status,new.status,auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function private.audit_prescription_change() from public,anon,authenticated;
drop trigger if exists trg_prescription_regulatory_audit on public.prescriptions;
create trigger trg_prescription_regulatory_audit
after insert or update of status on public.prescriptions
for each row execute function private.audit_prescription_change();

-- ---------------------------------------------------------------------------
-- Pharmaceutical dispensing: distinct from a generic ecommerce checkout.
-- ---------------------------------------------------------------------------
create table if not exists public.dispensations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  prescription_id uuid null references public.prescriptions(id) on delete restrict,
  order_id uuid null references public.orders(id) on delete restrict,
  status text not null default 'draft'
    check(status in ('draft','under_review','approved','dispensed','cancelled')),
  pharmacist_id uuid null references auth.users(id),
  approved_at timestamptz null,
  dispensed_at timestamptz null,
  retention_confirmed boolean not null default false,
  remote_delivery boolean not null default false,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dispensations_prescription_idx on public.dispensations(prescription_id);
create index if not exists dispensations_status_idx on public.dispensations(tenant_id,store_id,status,created_at desc);

create table if not exists public.dispensation_items (
  id uuid primary key default gen_random_uuid(),
  dispensation_id uuid not null references public.dispensations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  lot_id uuid null references public.inventory_lots(id) on delete restrict,
  quantity numeric(14,3) not null check(quantity>0),
  sngpc_required boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Regulatory transmission queue/history: SNGPC now, SNCR when pharmacy APIs apply.
-- ---------------------------------------------------------------------------
create table if not exists public.regulatory_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  system text not null check(system in ('sngpc','sncr','other')),
  entity_type text not null,
  entity_id uuid null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  payload_hash text null,
  status text not null default 'pending'
    check(status in ('pending','sending','accepted','rejected','retry','cancelled')),
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
-- Fiscal aggregate. Provider/SEFAZ adapter is intentionally separate.
-- ---------------------------------------------------------------------------
create table if not exists public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  order_id uuid null references public.orders(id) on delete restrict,
  pos_sale_id uuid null references public.pos_sales(id) on delete restrict,
  model text not null check(model in ('nfe','nfce')),
  series text null,
  number bigint null,
  access_key text null,
  status text not null default 'draft'
    check(status in ('draft','queued','authorized','rejected','cancelled','contingency','error')),
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
create index if not exists fiscal_documents_status_idx on public.fiscal_documents(tenant_id,store_id,status,created_at desc);

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
-- RLS for sensitive regulatory/fiscal data.
-- ---------------------------------------------------------------------------
alter table public.product_regulatory enable row level security;
alter table public.prescription_regulatory enable row level security;
alter table public.prescription_audit_events enable row level security;
alter table public.dispensations enable row level security;
alter table public.dispensation_items enable row level security;
alter table public.regulatory_submissions enable row level security;
alter table public.fiscal_documents enable row level security;
alter table public.fiscal_events enable row level security;

create policy product_regulatory_staff_read on public.product_regulatory
for select to authenticated
using(exists(
  select 1 from public.tenant_products tp
  where tp.product_id=product_regulatory.product_id
    and private.is_tenant_member(tp.tenant_id,auth.uid())
));

create policy prescription_regulatory_authorized_read on public.prescription_regulatory
for select to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist','auditor']));
create policy prescription_audit_authorized_read on public.prescription_audit_events
for select to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist','auditor']));
create policy dispensations_authorized_read on public.dispensations
for select to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist','auditor']));
create policy dispensation_items_authorized_read on public.dispensation_items
for select to authenticated
using(exists(
  select 1 from public.dispensations d
  where d.id=dispensation_items.dispensation_id
    and private.has_tenant_role(d.tenant_id,auth.uid(),array['owner','admin','manager','pharmacist','auditor'])
));
create policy regulatory_submissions_authorized_read on public.regulatory_submissions
for select to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist','auditor']));
create policy fiscal_documents_authorized_read on public.fiscal_documents
for select to authenticated
using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','finance','auditor']));
create policy fiscal_events_authorized_read on public.fiscal_events
for select to authenticated
using(exists(
  select 1 from public.fiscal_documents fd
  where fd.id=fiscal_events.fiscal_document_id
    and private.has_tenant_role(fd.tenant_id,auth.uid(),array['owner','admin','manager','finance','auditor'])
));

-- Client writes to regulated queues/docs are denied. Later server-side RPCs/adapters will own writes.
create policy regulatory_submissions_client_deny on public.regulatory_submissions
for all to anon,authenticated using(false) with check(false);

comment on table public.product_regulatory is 'Sanitary/regulatory product master independent of any ERP provider.';
comment on table public.dispensations is 'Pharmaceutical dispensing workflow separated from ecommerce ordering.';
comment on table public.regulatory_submissions is 'Reliable SNGPC/SNCR submission queue and protocol history.';
comment on table public.fiscal_documents is 'Canonical NF-e/NFC-e aggregate independent of a specific fiscal provider.';
