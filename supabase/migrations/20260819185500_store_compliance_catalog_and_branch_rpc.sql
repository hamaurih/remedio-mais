create table if not exists public.store_compliance_requirement_catalog (
  code text primary key,
  title text not null,
  category text not null check(category in ('legal','fiscal','sanitary','anvisa','crf','controlled','operational','digital')),
  applicability text not null default 'always',
  blocking boolean not null default true,
  legal_reference text null,
  guidance text null,
  effective_from date null,
  active boolean not null default true,
  sort_order integer not null default 100
);
alter table public.store_compliance_requirement_catalog enable row level security;
create policy store_compliance_requirement_catalog_read on public.store_compliance_requirement_catalog for select to authenticated using(true);

insert into public.store_compliance_requirement_catalog(code,title,category,applicability,blocking,legal_reference,guidance,effective_from,sort_order) values
('cnpj_card','Comprovante de inscrição e situação cadastral do CNPJ','legal','always',true,'IN RFB 2.119/2022 / REDESIM','A filial deve possuir inscrição própria como estabelecimento no CNPJ.',null,10),
('junta_commercial_registration','Registro do ato da filial na Junta Comercial','legal','always',true,'REDESIM / órgão de registro','Guardar ato registrado e protocolo de abertura da filial.',null,20),
('zoning_viability','Viabilidade de endereço / uso do solo','legal','always',true,'REDESIM','Aprovação do endereço antes do licenciamento.',null,30),
('operating_permit','Alvará municipal de funcionamento','legal','always',true,'Licenciamento local / REDESIM','Documento municipal que autoriza o funcionamento no endereço.',null,40),
('fire_safety_license','Licença/Certificado de segurança contra incêndio','legal','always',true,'Licenciamento local / legislação estadual','Manter documento do Corpo de Bombeiros ou equivalente local.',null,50),
('sanitary_license','Licença ou Alvará Sanitário','sanitary','pharmacy',true,'RDC 44/2009 art. 2º','Obrigatório por estabelecimento; emitido pela Vigilância Sanitária competente.',null,60),
('afe','Cobertura de Autorização de Funcionamento - AFE','anvisa','pharmacy',true,'RDC 275/2019; RDC 44/2009','Para medicamentos, a AFE da matriz pode alcançar a filial, desde que a filial esteja licenciada e cadastrada na Anvisa.',null,70),
('ae','Autorização Especial - AE','anvisa','compounding_controlled',true,'RDC 275/2019 / Portaria 344/1998','Condicional para farmácia de manipulação de substâncias sujeitas a controle especial.',null,80),
('crf_company_registration','Registro do estabelecimento no CRF','crf','pharmacy',true,'Lei 13.021/2014 / normas do CFF e CRF','Registrar cada estabelecimento no Conselho Regional de Farmácia.',null,90),
('crf_technical_regular_certificate','Certidão de Regularidade Técnica - CRT','crf','pharmacy',true,'RDC 44/2009 art. 2º','Deve estar válida e disponível no estabelecimento.',null,100),
('good_practices_manual','Manual de Boas Práticas Farmacêuticas','sanitary','pharmacy',true,'RDC 44/2009 arts. 2º e 85','Manual específico para as atividades da unidade.',null,110),
('standard_operating_procedures','Conjunto de POPs obrigatórios','operational','pharmacy',true,'RDC 44/2009 arts. 86 e 87','POPs aprovados, assinados e datados pelo farmacêutico RT.',null,120),
('pgrss','PGRSS','sanitary','pharmacy',true,'RDC 44/2009 art. 97; RDC 222/2018','Plano de Gerenciamento de Resíduos de Serviços de Saúde; se gerar somente Grupo D, registrar a condição conforme regra local.',null,130),
('group_d_waste_notification','Notificação de geração exclusiva de resíduos Grupo D','sanitary','pharmacy',false,'RDC 222/2018','Alternativa ao PGRSS quando aplicável e aceita pela autoridade sanitária.',null,131),
('staff_training_program','Programa e registros de treinamento','operational','pharmacy',true,'RDC 44/2009 arts. 24 e 25','Manter treinamento inicial e continuado da equipe.',null,140),
('pest_control_program','Controle de pragas por empresa licenciada','operational','pharmacy',true,'RDC 44/2009 art. 7º','Contrato/certificados e registros de desinsetização/desratização.',null,150),
('temperature_monitoring_program','Controle de temperatura e armazenamento','operational','pharmacy',true,'RDC 44/2009','Procedimento e registros compatíveis com os produtos armazenados.',null,160),
('sngpc','Credenciamento e escrituração SNGPC','controlled','controlled_or_antimicrobial',true,'RDC 22/2014; Portaria 344/1998; RDC 471/2021','Obrigatório para movimentação dos produtos abrangidos pelo SNGPC.',null,170),
('sncr_readiness','Preparação para SNCR','controlled','controlled',false,'RDC 873/2024 e RDC 1.028/2026','Acompanhar liberação de acesso e integração; funcionalidades para dispensadores têm disponibilização prevista até 30/09/2026.','2026-09-30',180),
('controlled_remote_delivery_procedure','POP de entrega remota de controlados','controlled','controlled_remote',true,'RDC 812/2023 / Portaria 344/1998','Entrega remota pode ocorrer com conferência/retenção da prescrição; venda de controlados pela internet permanece vedada.',null,190),
('vaccination_service_authorization','Autorização/licenciamento para serviço de vacinação','sanitary','vaccination',true,'RDC 197/2017','Somente aplicável se a unidade prestar vacinação.',null,200),
('cold_chain_controls','Controles de cadeia fria e equipamentos','operational','thermolabile',true,'Lei 13.021/2014; RDC 44/2009','Equipamentos e registros para conservação adequada de termolábeis.',null,210),
('website_legal_disclosure','Dados legais e sanitários no e-commerce','digital','remote',true,'RDC 44/2009 art. 53','O site deve exibir dados da farmácia responsável, CNPJ, endereço, RT, licença sanitária e AFE.',null,220),
('digital_certificate','Certificado digital do estabelecimento','fiscal','fiscal',true,'ICP-Brasil / regras fiscais aplicáveis','Controlar tipo, validade e responsável; segredos não devem ser gravados em campos públicos.',null,230),
('nfce_credential','Credenciamento NFC-e / CSC','fiscal','nfce',true,'SEFAZ da UF','Registrar apenas identificadores e situação; o CSC secreto deve ficar em cofre de segredos.',null,240),
('nfe_credential','Credenciamento NF-e','fiscal','nfe',true,'SEFAZ da UF','Validar emissão em homologação antes de produção.',null,250)
on conflict(code) do update set title=excluded.title,category=excluded.category,applicability=excluded.applicability,blocking=excluded.blocking,legal_reference=excluded.legal_reference,guidance=excluded.guidance,effective_from=excluded.effective_from,sort_order=excluded.sort_order,active=true;

create or replace function private.requirement_applies(p_applicability text, p public.store_legal_profiles) returns boolean language plpgsql immutable as $$
begin
  return case p_applicability when 'always' then true when 'pharmacy' then p.activity_type in ('drogaria','farmacia_sem_manipulacao','farmacia_com_manipulacao') when 'controlled' then p.sells_controlled_medicines when 'controlled_or_antimicrobial' then p.sells_controlled_medicines or p.sells_antimicrobials when 'compounding_controlled' then p.manipulates_controlled_substances when 'vaccination' then p.vaccination_service when 'thermolabile' then p.thermolabile_storage when 'remote' then p.remote_dispensing when 'controlled_remote' then p.remote_dispensing and p.sells_controlled_medicines when 'fiscal' then p.nfe_enabled or p.nfce_enabled when 'nfce' then p.nfce_enabled when 'nfe' then p.nfe_enabled else false end;
end;
$$;

create or replace function private.ensure_store_compliance_rows(p_store_id uuid) returns void language plpgsql security definer set search_path=public,private as $$
declare p public.store_legal_profiles%rowtype; hq_id uuid; afe_doc public.store_compliance_documents%rowtype; r record;
begin
  select * into p from public.store_legal_profiles where store_id=p_store_id; if not found then return; end if;
  for r in select * from public.store_compliance_requirement_catalog where active=true loop
    if private.requirement_applies(r.applicability,p) then insert into public.store_compliance_documents(tenant_id,store_id,document_type,status) values(p.tenant_id,p.store_id,r.code,'missing') on conflict(store_id,document_type) do nothing; end if;
  end loop;
  if p.activity_type in ('drogaria','farmacia_sem_manipulacao','farmacia_com_manipulacao') then
    select id into hq_id from public.stores where tenant_id=p.tenant_id and is_headquarters=true and id<>p.store_id order by created_at limit 1;
    if hq_id is not null then
      select * into afe_doc from public.store_compliance_documents where store_id=hq_id and document_type='afe' and status in ('valid','inherited') and (expires_at is null or expires_at>=current_date) limit 1;
      if found then update public.store_compliance_documents set status='inherited',document_number=afe_doc.document_number,issuer=afe_doc.issuer,issue_date=afe_doc.issue_date,expires_at=afe_doc.expires_at,inherited_from_store_id=hq_id,notes='Cobertura herdada da AFE da matriz; a filial ainda deve possuir licença sanitária local e cadastro aplicável na Anvisa.',updated_at=now() where store_id=p.store_id and document_type='afe' and status='missing'; end if;
    end if;
  end if;
end;
$$;

create or replace function private.store_legal_profile_sync_checklist() returns trigger language plpgsql security definer set search_path=public,private as $$ begin perform private.ensure_store_compliance_rows(new.store_id); return new; end; $$;
drop trigger if exists trg_store_legal_profile_sync_checklist on public.store_legal_profiles;
create trigger trg_store_legal_profile_sync_checklist after insert or update on public.store_legal_profiles for each row execute function private.store_legal_profile_sync_checklist();

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
  if p.activity_type in ('drogaria','farmacia_sem_manipulacao','farmacia_com_manipulacao') then
    if not private.store_document_current(p_store_id,'sanitary_license') then missing := array_append(missing,'sanitary_license'); end if;
    if not private.store_document_current(p_store_id,'crf_company_registration') then missing := array_append(missing,'crf_company_registration'); end if;
    if not private.store_document_current(p_store_id,'crf_technical_regular_certificate') then missing := array_append(missing,'crf_technical_regular_certificate'); end if;
    if not private.store_document_current(p_store_id,'good_practices_manual') then missing := array_append(missing,'good_practices_manual'); end if;
    if not private.store_document_current(p_store_id,'standard_operating_procedures') then missing := array_append(missing,'standard_operating_procedures'); end if;
    if not private.store_document_current(p_store_id,'staff_training_program') then missing := array_append(missing,'staff_training_program'); end if;
    if not private.store_document_current(p_store_id,'pest_control_program') then missing := array_append(missing,'pest_control_program'); end if;
    if not private.store_document_current(p_store_id,'temperature_monitoring_program') then missing := array_append(missing,'temperature_monitoring_program'); end if;
    if not (private.store_document_current(p_store_id,'pgrss') or private.store_document_current(p_store_id,'group_d_waste_notification')) then missing := array_append(missing,'pgrss_or_group_d_notification'); end if;
    if not private.store_document_current(p_store_id,'afe') then missing := array_append(missing,'afe'); end if;
  end if;
  if p.manipulates_controlled_substances and not private.store_document_current(p_store_id,'ae') then missing := array_append(missing,'ae'); end if;
  if (p.sells_controlled_medicines or p.sells_antimicrobials) and not private.store_document_current(p_store_id,'sngpc') then missing := array_append(missing,'sngpc'); end if;
  if p.remote_dispensing and not private.store_document_current(p_store_id,'website_legal_disclosure') then missing := array_append(missing,'website_legal_disclosure'); end if;
  if p.remote_dispensing and p.sells_controlled_medicines and not private.store_document_current(p_store_id,'controlled_remote_delivery_procedure') then missing := array_append(missing,'controlled_remote_delivery_procedure'); end if;
  select exists(select 1 from public.store_technical_responsibilities r where r.store_id=p_store_id and r.active=true and r.responsibility_type='technical_director' and r.starts_at<=current_date and (r.ends_at is null or r.ends_at>=current_date)) into has_rt;
  if p.activity_type in ('drogaria','farmacia_sem_manipulacao','farmacia_com_manipulacao') and not has_rt then missing := array_append(missing,'pharmacist_technical_director'); end if;
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

create or replace view public.store_compliance_checklist with (security_invoker=true) as
select s.tenant_id,s.id as store_id,c.code,c.title,c.category,c.blocking,c.legal_reference,c.guidance,c.effective_from,private.requirement_applies(c.applicability,p) as applicable,coalesce(d.status,'missing') as document_status,d.document_number,d.issuer,d.protocol_number,d.issue_date,d.expires_at,d.file_path,d.verification_url,d.notes,d.inherited_from_store_id,case when not private.requirement_applies(c.applicability,p) then true when c.code='pgrss' and private.store_document_current(s.id,'group_d_waste_notification') then true when c.blocking=false then true else private.store_document_current(s.id,c.code) end as satisfied from public.stores s join public.store_legal_profiles p on p.store_id=s.id cross join public.store_compliance_requirement_catalog c left join public.store_compliance_documents d on d.store_id=s.id and d.document_type=c.code where c.active=true;

create or replace function public.create_branch_legal_dossier(p_tenant_id uuid,p_payload jsonb) returns uuid language plpgsql security definer set search_path=public,private as $$
declare v_store_id uuid; v_rt_name text; v_crf text; v_crf_state text;
begin
  if auth.uid() is null or not private.has_tenant_role(p_tenant_id,auth.uid(),array['owner','admin','manager']) then raise exception 'Sem permissão para cadastrar filial'; end if;
  if coalesce(btrim(p_payload->>'name'),'')='' then raise exception 'Nome da filial é obrigatório'; end if;
  if length(regexp_replace(coalesce(p_payload->>'cnpj',''),'\D','','g'))<>14 then raise exception 'CNPJ da filial deve possuir 14 dígitos'; end if;
  insert into public.stores(tenant_id,name,code,cnpj,legal_name,address,phone,store_type,is_headquarters,active,delivery_enabled,pickup_enabled,ecommerce_fulfillment_enabled,service_radius_km,preparation_minutes,fulfillment_priority,compliance_enforced,operation_status) values(p_tenant_id,btrim(p_payload->>'name'),nullif(btrim(p_payload->>'code'),''),btrim(p_payload->>'cnpj'),nullif(btrim(p_payload->>'legal_name'),''),nullif(btrim(p_payload->>'address'),''),nullif(btrim(p_payload->>'phone'),''),'branch',false,false,coalesce((p_payload->>'delivery_enabled')::boolean,true),coalesce((p_payload->>'pickup_enabled')::boolean,true),false,coalesce((p_payload->>'service_radius_km')::numeric,18),coalesce((p_payload->>'preparation_minutes')::integer,20),100,true,'legalization') returning id into v_store_id;
  insert into public.store_legal_profiles(store_id,tenant_id,activity_type,cnae_primary,cnaes_secondary,legal_nature,state_registration,municipal_registration,junta_registration_number,redesim_protocol,tax_regime,opening_date,zip_code,street,street_number,complement,neighborhood,city,state_code,ibge_city_code,operating_hours,sells_prescription_medicines,sells_controlled_medicines,sells_antimicrobials,manipulates_medicines,manipulates_controlled_substances,pharmaceutical_services,vaccination_service,thermolabile_storage,remote_dispensing,nfe_enabled,nfce_enabled,fiscal_environment,sefaz_credential_status,digital_certificate_type,digital_certificate_expires_at) values(v_store_id,p_tenant_id,coalesce(nullif(p_payload->>'activity_type',''),'drogaria'),nullif(p_payload->>'cnae_primary',''),coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'cnaes_secondary','[]'::jsonb))),'{}'),nullif(p_payload->>'legal_nature',''),nullif(p_payload->>'state_registration',''),nullif(p_payload->>'municipal_registration',''),nullif(p_payload->>'junta_registration_number',''),nullif(p_payload->>'redesim_protocol',''),nullif(p_payload->>'tax_regime',''),nullif(p_payload->>'opening_date','')::date,nullif(p_payload->>'zip_code',''),nullif(p_payload->>'street',''),nullif(p_payload->>'street_number',''),nullif(p_payload->>'complement',''),nullif(p_payload->>'neighborhood',''),nullif(p_payload->>'city',''),nullif(p_payload->>'state_code',''),nullif(p_payload->>'ibge_city_code',''),coalesce(p_payload->'operating_hours','{}'::jsonb),coalesce((p_payload->>'sells_prescription_medicines')::boolean,true),coalesce((p_payload->>'sells_controlled_medicines')::boolean,false),coalesce((p_payload->>'sells_antimicrobials')::boolean,true),coalesce((p_payload->>'manipulates_medicines')::boolean,false),coalesce((p_payload->>'manipulates_controlled_substances')::boolean,false),coalesce((p_payload->>'pharmaceutical_services')::boolean,false),coalesce((p_payload->>'vaccination_service')::boolean,false),coalesce((p_payload->>'thermolabile_storage')::boolean,false),coalesce((p_payload->>'remote_dispensing')::boolean,true),coalesce((p_payload->>'nfe_enabled')::boolean,true),coalesce((p_payload->>'nfce_enabled')::boolean,true),'homologation','pending',nullif(p_payload->>'digital_certificate_type',''),nullif(p_payload->>'digital_certificate_expires_at','')::timestamptz);
  v_rt_name:=nullif(btrim(p_payload->>'rt_name'),''); v_crf:=nullif(btrim(p_payload->>'rt_crf_number'),''); v_crf_state:=nullif(btrim(p_payload->>'rt_crf_state'),'');
  if v_rt_name is not null and v_crf is not null and v_crf_state is not null then insert into public.store_technical_responsibilities(tenant_id,store_id,professional_name,crf_number,crf_state,responsibility_type,weekly_schedule,starts_at,active) values(p_tenant_id,v_store_id,v_rt_name,v_crf,v_crf_state,'technical_director',coalesce(p_payload->'rt_schedule','{}'::jsonb),coalesce(nullif(p_payload->>'rt_start_date','')::date,current_date),true); end if;
  perform private.ensure_store_compliance_rows(v_store_id); return v_store_id;
end;
$$;
revoke all on function public.create_branch_legal_dossier(uuid,jsonb) from public,anon;
grant execute on function public.create_branch_legal_dossier(uuid,jsonb) to authenticated;
revoke all on function private.requirement_applies(text,public.store_legal_profiles) from public,anon,authenticated;
revoke all on function private.ensure_store_compliance_rows(uuid) from public,anon,authenticated;
revoke all on function private.store_legal_profile_sync_checklist() from public,anon,authenticated;
