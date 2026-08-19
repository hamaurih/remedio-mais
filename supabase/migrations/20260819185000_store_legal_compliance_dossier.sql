alter table public.stores add column if not exists operation_status text not null default 'legalization' check (operation_status in ('draft','legalization','ready','active','suspended','closed'));
alter table public.stores add column if not exists compliance_enforced boolean not null default true;
alter table public.stores add column if not exists legal_operation_authorized_at timestamptz null;
alter table public.stores add column if not exists compliance_notes text null;

-- Não bloqueia retroativamente as unidades que já estavam operando antes deste módulo.
update public.stores
set compliance_enforced = false,
    operation_status = case when active then 'active' else 'draft' end,
    legal_operation_authorized_at = case when active then coalesce(legal_operation_authorized_at, now()) else legal_operation_authorized_at end;

create table if not exists public.store_legal_profiles (
  store_id uuid primary key references public.stores(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  activity_type text not null default 'drogaria' check (activity_type in ('drogaria','farmacia_sem_manipulacao','farmacia_com_manipulacao','distribution_center','administrative')),
  cnae_primary text null,
  cnaes_secondary text[] not null default '{}',
  legal_nature text null,
  state_registration text null,
  municipal_registration text null,
  junta_registration_number text null,
  redesim_protocol text null,
  tax_regime text null check (tax_regime is null or tax_regime in ('simples_nacional','lucro_presumido','lucro_real','outro')),
  opening_date date null,
  zip_code text null,
  street text null,
  street_number text null,
  complement text null,
  neighborhood text null,
  city text null,
  state_code char(2) null,
  ibge_city_code text null,
  operating_hours jsonb not null default '{}'::jsonb,
  sells_prescription_medicines boolean not null default true,
  sells_controlled_medicines boolean not null default false,
  sells_antimicrobials boolean not null default true,
  manipulates_medicines boolean not null default false,
  manipulates_controlled_substances boolean not null default false,
  pharmaceutical_services boolean not null default false,
  vaccination_service boolean not null default false,
  thermolabile_storage boolean not null default false,
  remote_dispensing boolean not null default true,
  nfe_enabled boolean not null default true,
  nfce_enabled boolean not null default true,
  fiscal_environment text not null default 'homologation' check (fiscal_environment in ('homologation','production')),
  sefaz_credential_status text not null default 'pending' check (sefaz_credential_status in ('pending','configured','validated','blocked')),
  digital_certificate_type text null check (digital_certificate_type is null or digital_certificate_type in ('a1','a3','cloud','other')),
  digital_certificate_expires_at timestamptz null,
  sncr_readiness_status text not null default 'monitoring' check (sncr_readiness_status in ('monitoring','pending','ready','integrated','not_applicable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_legal_profiles_tenant_idx on public.store_legal_profiles(tenant_id,store_id);

create table if not exists public.store_compliance_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  document_type text not null,
  document_number text null,
  issuer text null,
  protocol_number text null,
  issue_date date null,
  expires_at date null,
  status text not null default 'missing' check (status in ('missing','pending','valid','expired','rejected','inherited','not_applicable')),
  inherited_from_store_id uuid null references public.stores(id) on delete set null,
  file_path text null,
  verification_url text null,
  notes text null,
  verified_at timestamptz null,
  verified_by uuid null references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,document_type)
);
create index if not exists store_compliance_documents_store_status_idx on public.store_compliance_documents(store_id,status,expires_at);
create index if not exists store_compliance_documents_tenant_idx on public.store_compliance_documents(tenant_id,document_type);

create table if not exists public.store_technical_responsibilities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  professional_name text not null,
  crf_number text not null,
  crf_state char(2) not null,
  responsibility_type text not null default 'technical_director' check (responsibility_type in ('technical_director','substitute','assistant')),
  art_protocol text null,
  crt_number text null,
  weekly_schedule jsonb not null default '{}'::jsonb,
  starts_at date not null default current_date,
  ends_at date null,
  active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_technical_responsibilities_store_idx on public.store_technical_responsibilities(store_id,active,responsibility_type);

alter table public.store_legal_profiles enable row level security;
alter table public.store_compliance_documents enable row level security;
alter table public.store_technical_responsibilities enable row level security;

create policy store_legal_profiles_member_read on public.store_legal_profiles for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));
create policy store_legal_profiles_manage on public.store_legal_profiles for all to authenticated using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist','finance'])) with check(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist','finance']));
create policy store_compliance_documents_member_read on public.store_compliance_documents for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));
create policy store_compliance_documents_manage on public.store_compliance_documents for all to authenticated using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist','finance','auditor'])) with check(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist','finance','auditor']));
create policy store_technical_responsibilities_member_read on public.store_technical_responsibilities for select to authenticated using(private.is_tenant_member(tenant_id,auth.uid()));
create policy store_technical_responsibilities_manage on public.store_technical_responsibilities for all to authenticated using(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist'])) with check(private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','pharmacist']));

create or replace function private.store_document_current(p_store_id uuid, p_document_type text) returns boolean language sql stable security definer set search_path=public,private as $$
  select exists(select 1 from public.store_compliance_documents d where d.store_id=p_store_id and d.document_type=p_document_type and d.status in ('valid','inherited') and (d.expires_at is null or d.expires_at >= current_date));
$$;

create or replace function private.store_compliance_missing(p_store_id uuid) returns text[] language plpgsql stable security definer set search_path=public,private as $$
declare s public.stores%rowtype; p public.store_legal_profiles%rowtype; missing text[] := '{}'; has_rt boolean := false;
begin
  select * into s from public.stores where id=p_store_id; if not found then return array['store_not_found']; end if;
  select * into p from public.store_legal_profiles where store_id=p_store_id; if not found then return array['legal_profile']; end if;
  if s.cnpj is null or length(regexp_replace(s.cnpj,'\D','','g')) <> 14 then missing := array_append(missing,'cnpj'); end if;
  if s.legal_name is null or btrim(s.legal_name)='' then missing := array_append(missing,'legal_name'); end if;
  if p.cnae_primary is null or btrim(p.cnae_primary)='' then missing := array_append(missing,'cnae_primary'); end if;
  if p.state_registration is null or btrim(p.state_registration)='' then missing := array_append(missing,'state_registration'); end if;
  if p.municipal_registration is null or btrim(p.municipal_registration)='' then missing := array_append(missing,'municipal_registration'); end if;
  if p.tax_regime is null then missing := array_append(missing,'tax_regime'); end if;
  if p.zip_code is null or p.street is null or p.street_number is null or p.city is null or p.state_code is null then missing := array_append(missing,'structured_address'); end if;
  if p.operating_hours='{}'::jsonb then missing := array_append(missing,'operating_hours'); end if;
  if not private.store_document_current(p_store_id,'cnpj_card') then missing := array_append(missing,'cnpj_card'); end if;
  if not private.store_document_current(p_store_id,'junta_commercial_registration') then missing := array_append(missing,'junta_commercial_registration'); end if;
  if not private.store_document_current(p_store_id,'zoning_viability') then missing := array_append(missing,'zoning_viability'); end if;
  if not private.store_document_current(p_store_id,'operating_permit') then missing := array_append(missing,'operating_permit'); end if;
  if not private.store_document_current(p_store_id,'fire_safety_license') then missing := array_append(missing,'fire_safety_license'); end if;
  if not private.store_document_current(p_store_id,'sanitary_license') then missing := array_append(missing,'sanitary_license'); end if;
  if not private.store_document_current(p_store_id,'crf_company_registration') then missing := array_append(missing,'crf_company_registration'); end if;
  if not private.store_document_current(p_store_id,'crf_technical_regular_certificate') then missing := array_append(missing,'crf_technical_regular_certificate'); end if;
  if not private.store_document_current(p_store_id,'good_practices_manual') then missing := array_append(missing,'good_practices_manual'); end if;
  if not (private.store_document_current(p_store_id,'pgrss') or private.store_document_current(p_store_id,'group_d_waste_notification')) then missing := array_append(missing,'pgrss_or_group_d_notification'); end if;
  if p.activity_type in ('drogaria','farmacia_sem_manipulacao','farmacia_com_manipulacao') and not private.store_document_current(p_store_id,'afe') then missing := array_append(missing,'afe'); end if;
  if p.manipulates_controlled_substances and not private.store_document_current(p_store_id,'ae') then missing := array_append(missing,'ae'); end if;
  if (p.sells_controlled_medicines or p.sells_antimicrobials) and not private.store_document_current(p_store_id,'sngpc') then missing := array_append(missing,'sngpc'); end if;
  select exists(select 1 from public.store_technical_responsibilities r where r.store_id=p_store_id and r.active=true and r.responsibility_type='technical_director' and r.starts_at<=current_date and (r.ends_at is null or r.ends_at>=current_date)) into has_rt;
  if not has_rt then missing := array_append(missing,'pharmacist_technical_director'); end if;
  if (p.nfe_enabled or p.nfce_enabled) then
    if not private.store_document_current(p_store_id,'digital_certificate') then missing := array_append(missing,'digital_certificate'); end if;
    if p.sefaz_credential_status <> 'validated' then missing := array_append(missing,'sefaz_credential'); end if;
    if p.nfce_enabled and not private.store_document_current(p_store_id,'nfce_credential') then missing := array_append(missing,'nfce_credential'); end if;
    if p.nfe_enabled and not private.store_document_current(p_store_id,'nfe_credential') then missing := array_append(missing,'nfe_credential'); end if;
  else missing := array_append(missing,'fiscal_document_configuration'); end if;
  if p.vaccination_service and not private.store_document_current(p_store_id,'vaccination_service_authorization') then missing := array_append(missing,'vaccination_service_authorization'); end if;
  if p.thermolabile_storage and not private.store_document_current(p_store_id,'cold_chain_controls') then missing := array_append(missing,'cold_chain_controls'); end if;
  return missing;
end;
$$;

create or replace view public.store_compliance_readiness with (security_invoker=true) as
select s.tenant_id,s.id as store_id,s.name as store_name,s.is_headquarters,s.compliance_enforced,s.operation_status,private.store_compliance_missing(s.id) as missing_requirements,cardinality(private.store_compliance_missing(s.id)) as missing_count,case when not s.compliance_enforced then 'legacy_review' when cardinality(private.store_compliance_missing(s.id))=0 then 'ready' else 'pending' end as compliance_status from public.stores s;

create or replace function private.guard_store_legal_activation() returns trigger language plpgsql security definer set search_path=public,private as $$
declare missing text[];
begin
  if tg_op='INSERT' and new.compliance_enforced then new.active:=false; new.ecommerce_fulfillment_enabled:=false; new.operation_status:='legalization'; return new; end if;
  if tg_op='UPDATE' and new.compliance_enforced and (new.active or new.ecommerce_fulfillment_enabled) then
    missing:=private.store_compliance_missing(new.id);
    if cardinality(missing)>0 then raise exception 'Filial ainda não está regularizada. Pendências: %',array_to_string(missing,', '); end if;
    new.operation_status:=case when new.active then 'active' else 'ready' end;
    new.legal_operation_authorized_at:=coalesce(new.legal_operation_authorized_at,now());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_store_legal_activation on public.stores;
create trigger trg_guard_store_legal_activation before insert or update of active,ecommerce_fulfillment_enabled,compliance_enforced on public.stores for each row execute function private.guard_store_legal_activation();
revoke all on function private.store_document_current(uuid,text) from public,anon,authenticated;
revoke all on function private.store_compliance_missing(uuid) from public,anon,authenticated;
revoke all on function private.guard_store_legal_activation() from public,anon,authenticated;
