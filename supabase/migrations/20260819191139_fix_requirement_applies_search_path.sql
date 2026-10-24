create or replace function private.requirement_applies(p_applicability text, p public.store_legal_profiles)
returns boolean
language plpgsql
immutable
set search_path=public,private
as $$
begin
  return case p_applicability
    when 'always' then true
    when 'pharmacy' then p.activity_type in ('drogaria','farmacia_sem_manipulacao','farmacia_com_manipulacao')
    when 'controlled' then p.sells_controlled_medicines
    when 'controlled_or_antimicrobial' then p.sells_controlled_medicines or p.sells_antimicrobials
    when 'compounding_controlled' then p.manipulates_controlled_substances
    when 'vaccination' then p.vaccination_service
    when 'thermolabile' then p.thermolabile_storage
    when 'remote' then p.remote_dispensing
    when 'controlled_remote' then p.remote_dispensing and p.sells_controlled_medicines
    when 'fiscal' then p.nfe_enabled or p.nfce_enabled
    when 'nfce' then p.nfce_enabled
    when 'nfe' then p.nfe_enabled
    else false
  end;
end;
$$;
revoke all on function private.requirement_applies(text,public.store_legal_profiles) from public,anon,authenticated;
