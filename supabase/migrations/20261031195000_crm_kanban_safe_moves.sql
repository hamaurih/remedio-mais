-- CRM Kanban: edição restrita de etapa comercial, sem mutações de pedidos, preços, estoque, pagamento ou dispensação.
-- Mantém leitura das oportunidades no RPC existente; só permite movimentos anteriores ao pedido.
create or replace function private.crm_move_opportunity(
  p_opportunity_id uuid,
  p_expected_stage text,
  p_new_stage text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tenant_id uuid;
  v_row public.crm_opportunities%rowtype;
  v_new_stage text:=trim(coalesce(p_new_stage,''));
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode='42501'; end if;
  if app_security.has_role(auth.uid(),'admin'::public.app_role) then
    v_tenant_id:=private.crm_active_tenant_id();
  else
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    where tm.user_id=auth.uid() and tm.active=true and tm.role::text in ('owner','admin','manager')
    order by tm.created_at asc limit 1;
  end if;
  if v_tenant_id is null then raise exception 'forbidden' using errcode='42501'; end if;
  if v_new_stage not in ('new','engaged','conversation','quote') then
    raise exception 'invalid_commercial_stage' using errcode='22023';
  end if;
  select * into v_row
  from public.crm_opportunities
  where id=p_opportunity_id and tenant_id=v_tenant_id
  for update;
  if not found then raise exception 'opportunity_not_found' using errcode='P0002'; end if;
  if v_row.status<>'open' or v_row.order_id is not null
    or v_row.stage not in ('new','engaged','conversation','quote','cart') then
    raise exception 'system_managed_stage' using errcode='22023';
  end if;
  if v_row.stage is distinct from p_expected_stage then
    raise exception 'stage_conflict_refresh' using errcode='40001';
  end if;
  if v_row.stage=v_new_stage then
    return jsonb_build_object('opportunity_id',v_row.id,'stage',v_row.stage,'changed',false);
  end if;

  update public.crm_opportunities
  set stage=v_new_stage,updated_at=now()
  where id=v_row.id;

  insert into public.crm_events(
    tenant_id,contact_id,opportunity_id,event_type,channel,source,
    occurred_at,order_id,cart_session_id,conversation_id,value,metadata
  )
  values(
    v_row.tenant_id,v_row.contact_id,v_row.id,'crm_stage_moved',
    v_row.current_channel,'erp_admin',now(),v_row.order_id,v_row.cart_session_id,
    v_row.conversation_id,v_row.value,
    jsonb_build_object('from',v_row.stage,'to',v_new_stage,'actor_id',auth.uid())
  );
  return jsonb_build_object('opportunity_id',v_row.id,'stage',v_new_stage,'changed',true);
end
$$;
revoke all on function private.crm_move_opportunity(uuid,text,text) from public;
revoke all on function private.crm_move_opportunity(uuid,text,text) from anon;
grant execute on function private.crm_move_opportunity(uuid,text,text) to authenticated;

-- A entrada exposta não é SECURITY DEFINER; guarda de autorização/tenant fica na função privada.
create or replace function public.admin_crm_move_opportunity(
  p_opportunity_id uuid,
  p_expected_stage text,
  p_new_stage text
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.crm_move_opportunity(p_opportunity_id,p_expected_stage,p_new_stage);
$$;
revoke all on function public.admin_crm_move_opportunity(uuid,text,text) from public;
revoke all on function public.admin_crm_move_opportunity(uuid,text,text) from anon;
grant execute on function public.admin_crm_move_opportunity(uuid,text,text) to authenticated;
