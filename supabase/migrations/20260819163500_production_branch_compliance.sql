-- Production-safe Matriz/Filiais compliance module.
-- Adds legal/regulatory management without enabling multi-store fulfillment.

alter table public.stores add column if not exists store_type text not null default 'branch'
  check (store_type in ('headquarters','branch','distribution_center'));
alter table public.stores add column if not exists is_headquarters boolean not null default false;
alter table public.stores add column if not exists operation_status text not null default 'active'
  check (operation_status in ('legalization','active','suspended','closed'));
alter table public.stores add column if not exists compliance_status text not null default 'legacy_review'
  check (compliance_status in ('legacy_review','pending','regular','expired','suspended'));
alter table public.stores add column if not exists compliance_enforced boolean not null default false;
alter table public.stores add column if not exists ecommerce_fulfillment_enabled boolean not null default false;
alter table public.stores add column if not exists latitude numeric(10,7);
alter table public.stores add column if not exists longitude numeric(10,7);
alter table public.stores add column if not exists phone text;
alter table public.stores add column if not exists delivery_enabled boolean not null default false;
alter table public.stores add column if not exists pickup_enabled boolean not null default false;
alter table public.stores add column if not exists service_radius_km numeric(8,2) not null default 18 check(service_radius_km > 0);
alter table public.stores add column if not exists preparation_minutes integer not null default 20 check(preparation_minutes >= 0);

update public.stores
set store_type='headquarters', is_headquarters=true, operation_status='active',
    compliance_status='legacy_review', compliance_enforced=false,
    ecommerce_fulfillment_enabled=false
where code='MATRIZ' or id=(select id from public.stores order by created_at limit 1);

create unique index if not exists stores_one_headquarters_per_tenant_prod_uq
on public.stores(tenant_id) where is_headquarters=true and active=true;

create table if not exists public.store_legal_profiles (
  store_id uuid primary key references public.stores(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  trade_name text,
  legal_name text,
  cnpj text,
  cnae_main text,
  legal_nature text,
  tax_regime text,
  state_registration text,
  municipal_registration text,
  junta_registration text,
  redesim_protocol text,
  zoning_viability_status text,
  opening_date date,
  zip_code text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  ibge_code text,
  phone text,
  email text,
  opening_hours jsonb not null default '{}'::jsonb,
  handles_prescription_medicines boolean not null default true,
  handles_controlled_medicines boolean not null default false,
  handles_antimicrobials boolean not null default false,
  has_manipulation boolean not null default false,
  offers_pharmaceutical_services boolean not null default false,
  offers_vaccination boolean not null default false,
  handles_thermolabile boolean not null default false,
  offers_remote_service boolean not null default false,
  pharmacist_rt_name text,
  pharmacist_rt_cpf text,
  pharmacist_rt_crf text,
  pharmacist_rt_crf_state text,
  pharmacist_rt_start_date date,
  pharmacist_assistance_hours text,
  digital_certificate_type text,
  digital_certificate_expires_at date,
  sefaz_status text,
  nfe_credential_status text,
  nfce_credential_status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_compliance_catalog (
  code text primary key,
  category text not null,
  title text not null,
  description text,
  base_required boolean not null default true,
  condition_code text,
  sort_order integer not null default 100,
  legal_reference text,
  active boolean not null default true
);

insert into public.store_compliance_catalog(code,category,title,description,base_required,condition_code,sort_order,legal_reference) values
('cnpj_card','Societário','Comprovante de inscrição no CNPJ','CNPJ do estabelecimento/filial e situação cadastral.',true,null,10,'REDESIM / Receita Federal'),
('junta_commercial_registration','Societário','Registro na Junta Comercial','Ato de abertura/alteração que inclua o estabelecimento.',true,null,20,'REDESIM / Junta Comercial'),
('zoning_viability','Societário','Viabilidade do endereço','Consulta prévia/viabilidade para exercício da atividade no endereço.',true,null,30,'REDESIM / Município'),
('operating_permit','Municipal','Alvará de funcionamento','Licença/alvará municipal aplicável ao estabelecimento.',true,null,40,'Município'),
('fire_safety_license','Segurança','Regularidade de segurança contra incêndio','Documento aplicável do Corpo de Bombeiros conforme risco/local.',true,null,50,'Corpo de Bombeiros / norma local'),
('sanitary_license','Sanitário','Licença sanitária do estabelecimento','Licença sanitária válida emitida pela autoridade sanitária local.',true,null,60,'RDC Anvisa 44/2009 / Vigilância Sanitária'),
('afe','ANVISA','Autorização de Funcionamento - AFE','Registrar a AFE aplicável e, quando cabível, a cobertura da matriz sobre a filial licenciada.',true,null,70,'Lei 6.360/1976 / Anvisa'),
('ae','ANVISA','Autorização Especial - AE','Exigida somente quando a atividade da unidade estiver sujeita à autorização especial.',false,'controlled_manipulation',80,'Anvisa / Portaria SVS 344/1998'),
('crf_company_registration','CRF','Registro do estabelecimento no CRF','Registro da pessoa jurídica/unidade no Conselho Regional de Farmácia.',true,null,90,'Lei 3.820/1960 / CRF'),
('crf_technical_regular_certificate','CRF','Certidão de Regularidade Técnica','Certidão vigente com responsabilidade e assistência farmacêutica.',true,null,100,'RDC Anvisa 44/2009 / CRF'),
('pharmacist_technical_director','CRF','Farmacêutico responsável técnico','RT, CRF, vínculo e escala de assistência farmacêutica.',true,null,110,'Lei 13.021/2014 / RDC Anvisa 44/2009'),
('good_practices_manual','Sanitário','Manual de Boas Práticas Farmacêuticas','Manual vigente e compatível com as atividades da unidade.',true,null,120,'RDC Anvisa 44/2009'),
('standard_operating_procedures','Sanitário','Procedimentos Operacionais Padrão - POPs','POPs vigentes das rotinas sanitárias e operacionais.',true,null,130,'RDC Anvisa 44/2009'),
('staff_training_program','Sanitário','Treinamento da equipe','Registros de capacitação e treinamento dos colaboradores.',true,null,140,'RDC Anvisa 44/2009'),
('pest_control_program','Sanitário','Controle integrado de pragas','Comprovantes e rotina de controle de vetores e pragas.',true,null,150,'RDC Anvisa 44/2009'),
('temperature_monitoring_program','Sanitário','Monitoramento de temperatura','Registros e procedimento de controle das condições de armazenamento.',true,null,160,'RDC Anvisa 44/2009'),
('pgrss_or_group_d_notification','Ambiental','PGRSS / enquadramento de resíduos','Plano ou documentação aplicável ao gerenciamento de resíduos de serviços de saúde.',true,null,170,'RDC Anvisa 222/2018'),
('sngpc','Controlados','Regularidade no SNGPC','Credenciamento e operação quando houver controlados ou antimicrobianos sujeitos à escrituração.',false,'controlled_or_antimicrobial',180,'Anvisa - SNGPC'),
('sncr_readiness','Controlados','Preparação para SNCR','Acompanhamento da transição/implantação do Sistema Nacional de Controle de Receituários.',false,'controlled',190,'Anvisa - SNCR'),
('pharmaceutical_services','Sanitário','Regularidade dos serviços farmacêuticos','Estrutura e documentos quando a unidade oferece serviços farmacêuticos.',false,'services',200,'RDC Anvisa 44/2009'),
('vaccination_license','Sanitário','Regularidade para vacinação','Licença/estrutura e requisitos específicos quando houver vacinação.',false,'vaccination',210,'RDC Anvisa 197/2017 e normas locais'),
('cold_chain','Sanitário','Cadeia fria / termolábeis','Procedimentos, equipamentos e registros quando houver produtos termolábeis.',false,'thermolabile',220,'Boas práticas sanitárias aplicáveis'),
('controlled_remote_delivery_procedure','Sanitário','Procedimento para atendimento remoto de itens sujeitos a controle','Revisão jurídica/sanitária específica antes de habilitar fluxo remoto de medicamentos controlados.',false,'controlled_remote',230,'Normas sanitárias aplicáveis'),
('website_legal_disclosure','E-commerce','Identificação legal no site','Exibição das informações obrigatórias do estabelecimento responsável pelo atendimento online.',true,null,240,'RDC Anvisa 44/2009 / comércio eletrônico'),
('digital_certificate','Fiscal','Certificado digital','Certificado digital válido para operações fiscais da unidade quando aplicável.',true,null,250,'SEFAZ / ICP-Brasil'),
('sefaz_credential','Fiscal','Credenciamento SEFAZ','Situação do estabelecimento perante a SEFAZ para emissão fiscal.',true,null,260,'SEFAZ estadual'),
('nfe_credential','Fiscal','Credenciamento NF-e','Habilitação/configuração para emissão de NF-e.',true,null,270,'SEFAZ / Ajuste SINIEF'),
('nfce_credential','Fiscal','Credenciamento NFC-e','Habilitação/configuração para emissão de NFC-e.',true,null,280,'SEFAZ / legislação estadual')
on conflict(code) do update set
 category=excluded.category,title=excluded.title,description=excluded.description,
 base_required=excluded.base_required,condition_code=excluded.condition_code,
 sort_order=excluded.sort_order,legal_reference=excluded.legal_reference,active=true;

create table if not exists public.store_compliance_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requirement_code text not null references public.store_compliance_catalog(code) on delete restrict,
  required boolean not null default true,
  status text not null default 'pending' check(status in ('pending','in_review','regular','not_applicable','expired','suspended')),
  document_number text,
  protocol text,
  issuer text,
  issue_date date,
  expiry_date date,
  official_url text,
  file_path text,
  notes text,
  inherited_from_store_id uuid references public.stores(id) on delete set null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,requirement_code)
);

create index if not exists store_compliance_items_store_idx on public.store_compliance_items(store_id,required,status);
create index if not exists store_compliance_items_expiry_idx on public.store_compliance_items(expiry_date) where expiry_date is not null;

alter table public.store_legal_profiles enable row level security;
alter table public.store_compliance_catalog enable row level security;
alter table public.store_compliance_items enable row level security;

drop policy if exists store_legal_profiles_admin_all on public.store_legal_profiles;
create policy store_legal_profiles_admin_all on public.store_legal_profiles for all to authenticated
using(public.has_role(auth.uid(),'admin'::public.app_role)) with check(public.has_role(auth.uid(),'admin'::public.app_role));

drop policy if exists store_compliance_catalog_admin_read on public.store_compliance_catalog;
create policy store_compliance_catalog_admin_read on public.store_compliance_catalog for select to authenticated
using(public.has_role(auth.uid(),'admin'::public.app_role));

drop policy if exists store_compliance_items_admin_all on public.store_compliance_items;
create policy store_compliance_items_admin_all on public.store_compliance_items for all to authenticated
using(public.has_role(auth.uid(),'admin'::public.app_role)) with check(public.has_role(auth.uid(),'admin'::public.app_role));

create or replace function public.refresh_store_compliance(p_store_id uuid)
returns void language plpgsql security definer set search_path='public' as $$
declare
  p public.store_legal_profiles%rowtype;
  s public.stores%rowtype;
  r record;
  applies boolean;
begin
  if auth.uid() is not null and not public.has_role(auth.uid(),'admin'::public.app_role) then
    raise exception 'Acesso restrito a administrador';
  end if;
  select * into s from public.stores where id=p_store_id;
  if s.id is null then raise exception 'Unidade não encontrada'; end if;
  insert into public.store_legal_profiles(store_id,tenant_id,trade_name,legal_name,cnpj)
  values(s.id,s.tenant_id,s.name,s.legal_name,s.cnpj)
  on conflict(store_id) do nothing;
  select * into p from public.store_legal_profiles where store_id=p_store_id;

  for r in select * from public.store_compliance_catalog where active order by sort_order loop
    applies := r.base_required or case coalesce(r.condition_code,'')
      when 'controlled_manipulation' then p.has_manipulation and p.handles_controlled_medicines
      when 'controlled_or_antimicrobial' then p.handles_controlled_medicines or p.handles_antimicrobials
      when 'controlled' then p.handles_controlled_medicines
      when 'services' then p.offers_pharmaceutical_services
      when 'vaccination' then p.offers_vaccination
      when 'thermolabile' then p.handles_thermolabile
      when 'controlled_remote' then p.handles_controlled_medicines and p.offers_remote_service
      else false end;

    insert into public.store_compliance_items(store_id,tenant_id,requirement_code,required,status)
    values(s.id,s.tenant_id,r.code,applies,case when applies then 'pending' else 'not_applicable' end)
    on conflict(store_id,requirement_code) do update set
      required=excluded.required,
      status=case
        when excluded.required and public.store_compliance_items.status='not_applicable' then 'pending'
        when not excluded.required and public.store_compliance_items.status in ('pending','in_review') then 'not_applicable'
        else public.store_compliance_items.status end,
      updated_at=now();
  end loop;
end $$;

revoke all on function public.refresh_store_compliance(uuid) from public, anon;
grant execute on function public.refresh_store_compliance(uuid) to authenticated, service_role;

create or replace function public.recalculate_store_compliance(p_store_id uuid)
returns void language plpgsql security definer set search_path='public' as $$
declare missing_count integer; expired_count integer;
begin
  select count(*) into missing_count from public.store_compliance_items
  where store_id=p_store_id and required=true and (status <> 'regular' or (expiry_date is not null and expiry_date < current_date));
  select count(*) into expired_count from public.store_compliance_items
  where store_id=p_store_id and required=true and expiry_date is not null and expiry_date < current_date;
  update public.stores set compliance_status=case when expired_count>0 then 'expired' when missing_count=0 then 'regular' else 'pending' end, updated_at=now()
  where id=p_store_id and compliance_enforced=true;
end $$;
revoke all on function public.recalculate_store_compliance(uuid) from public, anon, authenticated;
grant execute on function public.recalculate_store_compliance(uuid) to service_role;

create or replace function public.trg_store_compliance_item_recalc()
returns trigger language plpgsql security definer set search_path='public' as $$
begin
  perform public.recalculate_store_compliance(coalesce(new.store_id,old.store_id));
  return coalesce(new,old);
end $$;

drop trigger if exists trg_store_compliance_item_recalc on public.store_compliance_items;
create trigger trg_store_compliance_item_recalc after insert or update or delete on public.store_compliance_items
for each row execute function public.trg_store_compliance_item_recalc();

create or replace function public.trg_guard_store_legal_activation()
returns trigger language plpgsql set search_path='public' as $$
declare missing_count integer; missing_codes text;
begin
  if new.compliance_enforced and (new.active or new.ecommerce_fulfillment_enabled or new.operation_status='active') then
    select count(*), string_agg(c.title, ', ' order by c.sort_order)
    into missing_count,missing_codes
    from public.store_compliance_items i join public.store_compliance_catalog c on c.code=i.requirement_code
    where i.store_id=new.id and i.required=true
      and (i.status <> 'regular' or (i.expiry_date is not null and i.expiry_date < current_date));
    if missing_count>0 then
      raise exception 'Unidade não pode ser ativada: % pendência(s): %',missing_count,coalesce(missing_codes,'checklist não preenchido');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_store_legal_activation on public.stores;
create trigger trg_guard_store_legal_activation before insert or update of active,ecommerce_fulfillment_enabled,operation_status on public.stores
for each row execute function public.trg_guard_store_legal_activation();

create or replace function public.create_branch_legal_dossier(p_payload jsonb)
returns uuid language plpgsql security definer set search_path='public' as $$
declare tenant uuid; sid uuid;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin'::public.app_role) then raise exception 'Acesso restrito a administrador'; end if;
  select id into tenant from public.tenants where active=true order by created_at limit 1;
  if tenant is null then raise exception 'Empresa não encontrada'; end if;
  insert into public.stores(tenant_id,name,code,cnpj,legal_name,address,active,store_type,is_headquarters,operation_status,compliance_status,compliance_enforced,ecommerce_fulfillment_enabled,delivery_enabled,pickup_enabled,phone)
  values(tenant,coalesce(nullif(trim(p_payload->>'name'),''),'Nova filial'),nullif(trim(p_payload->>'code'),''),nullif(trim(p_payload->>'cnpj'),''),nullif(trim(p_payload->>'legal_name'),''),nullif(trim(p_payload->>'address'),''),false,'branch',false,'legalization','pending',true,false,false,false,nullif(trim(p_payload->>'phone'),''))
  returning id into sid;
  insert into public.store_legal_profiles(store_id,tenant_id,trade_name,legal_name,cnpj,phone,zip_code,street,number,complement,neighborhood,city,state,cnae_main,tax_regime,state_registration,municipal_registration,redesim_protocol)
  values(sid,tenant,nullif(trim(p_payload->>'name'),''),nullif(trim(p_payload->>'legal_name'),''),nullif(trim(p_payload->>'cnpj'),''),nullif(trim(p_payload->>'phone'),''),nullif(trim(p_payload->>'zip_code'),''),nullif(trim(p_payload->>'street'),''),nullif(trim(p_payload->>'number'),''),nullif(trim(p_payload->>'complement'),''),nullif(trim(p_payload->>'neighborhood'),''),nullif(trim(p_payload->>'city'),''),nullif(trim(p_payload->>'state'),''),nullif(trim(p_payload->>'cnae_main'),''),nullif(trim(p_payload->>'tax_regime'),''),nullif(trim(p_payload->>'state_registration'),''),nullif(trim(p_payload->>'municipal_registration'),''),nullif(trim(p_payload->>'redesim_protocol'),''));
  perform public.refresh_store_compliance(sid);
  perform public.recalculate_store_compliance(sid);
  return sid;
end $$;
revoke all on function public.create_branch_legal_dossier(jsonb) from public, anon;
grant execute on function public.create_branch_legal_dossier(jsonb) to authenticated;

-- Bootstrap legal profile/checklist for existing units without enforcing any retroactive block.
insert into public.store_legal_profiles(store_id,tenant_id,trade_name,legal_name,cnpj)
select id,tenant_id,name,legal_name,cnpj from public.stores
on conflict(store_id) do nothing;
select public.refresh_store_compliance(id) from public.stores;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('store-compliance','store-compliance',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists store_compliance_admin_read_files on storage.objects;
create policy store_compliance_admin_read_files on storage.objects for select to authenticated
using(bucket_id='store-compliance' and public.has_role(auth.uid(),'admin'::public.app_role));
drop policy if exists store_compliance_admin_insert_files on storage.objects;
create policy store_compliance_admin_insert_files on storage.objects for insert to authenticated
with check(bucket_id='store-compliance' and public.has_role(auth.uid(),'admin'::public.app_role));
drop policy if exists store_compliance_admin_update_files on storage.objects;
create policy store_compliance_admin_update_files on storage.objects for update to authenticated
using(bucket_id='store-compliance' and public.has_role(auth.uid(),'admin'::public.app_role))
with check(bucket_id='store-compliance' and public.has_role(auth.uid(),'admin'::public.app_role));
drop policy if exists store_compliance_admin_delete_files on storage.objects;
create policy store_compliance_admin_delete_files on storage.objects for delete to authenticated
using(bucket_id='store-compliance' and public.has_role(auth.uid(),'admin'::public.app_role));
