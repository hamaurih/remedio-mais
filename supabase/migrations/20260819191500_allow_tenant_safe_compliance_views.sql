create or replace function private.store_document_current(p_store_id uuid, p_document_type text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,private
as $$
declare v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.stores where id=p_store_id;
  if v_tenant_id is null then return false; end if;
  if auth.uid() is not null and not private.is_tenant_member(v_tenant_id,auth.uid()) then return false; end if;
  return exists(select 1 from public.store_compliance_documents d where d.store_id=p_store_id and d.document_type=p_document_type and d.status in ('valid','inherited') and (d.expires_at is null or d.expires_at>=current_date));
end;
$$;

create or replace function private.store_compliance_missing(p_store_id uuid)
returns text[] language plpgsql stable security definer set search_path=public,private as $$
declare s public.stores%rowtype; p public.store_legal_profiles%rowtype; missing text[] := '{}'; has_rt boolean := false;
begin
  select * into s from public.stores where id=p_store_id; if not found then return array['store_not_found']; end if;
  if auth.uid() is not null and not private.is_tenant_member(s.tenant_id,auth.uid()) then return array['access_denied']; end if;
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

grant execute on function private.store_document_current(uuid,text) to authenticated;
grant execute on function private.store_compliance_missing(uuid) to authenticated;
grant execute on function private.requirement_applies(text,public.store_legal_profiles) to authenticated;
