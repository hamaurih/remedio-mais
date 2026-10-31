-- INCIDENT / CRM event projections are best effort; order writes are authoritative.
-- Keep original trigger functions and their business projections intact,
-- adding an exception guard (subtransaction) with SQLSTATE-only warning.
-- Any failure rolls back only CRM writes, never the checkout/order/cart write.
-- Reconciliation can replay failed projections from the authoritative ERP.

CREATE OR REPLACE FUNCTION private.crm_cart_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.crm_sync_cart_session(new.id);
  return new;
exception when others then
  -- The CRM is a projection. It must not abort an order, checkout or cart event.
  -- SQLSTATE is logged for monitoring; no PII or sensitive payload is logged.
  raise warning 'crm_projection_nonblocking_failure: trigger=%, sqlstate=%', TG_NAME, SQLSTATE;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.crm_order_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant_id uuid;
  v_contact_id uuid;
  v_opp_id uuid;
  v_channel text;
begin
  perform private.crm_sync_order(new.id);
  v_tenant_id:=coalesce(new.tenant_id,private.crm_active_tenant_id());
  v_contact_id:=private.crm_contact_for_order(new.id);
  select id into v_opp_id from public.crm_opportunities where tenant_id=v_tenant_id and order_id=new.id limit 1;
  v_channel:=private.crm_channel(new.sales_channel,new.source);

  if tg_op='UPDATE' then
    if new.payment_status is distinct from old.payment_status then
      insert into public.crm_events(tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,cart_session_id,conversation_id,value,metadata)
      values(v_tenant_id,v_contact_id,v_opp_id,'payment_status_changed',v_channel,'erp',now(),new.id,new.cart_session_id,coalesce(new.source_conversation_id,new.ai_conversation_id),new.total,
        jsonb_build_object('from',old.payment_status,'to',new.payment_status))
      ;
    end if;
    if new.order_status is distinct from old.order_status then
      insert into public.crm_events(tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,cart_session_id,conversation_id,value,metadata)
      values(v_tenant_id,v_contact_id,v_opp_id,'order_status_changed',v_channel,'erp',now(),new.id,new.cart_session_id,coalesce(new.source_conversation_id,new.ai_conversation_id),new.total,
        jsonb_build_object('from',old.order_status,'to',new.order_status));
    end if;
    if new.fulfillment_status is distinct from old.fulfillment_status then
      insert into public.crm_events(tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,cart_session_id,conversation_id,value,metadata)
      values(v_tenant_id,v_contact_id,v_opp_id,'fulfillment_status_changed',v_channel,'erp',now(),new.id,new.cart_session_id,coalesce(new.source_conversation_id,new.ai_conversation_id),new.total,
        jsonb_build_object('from',old.fulfillment_status,'to',new.fulfillment_status));
    end if;
    if new.delivery_status is distinct from old.delivery_status then
      insert into public.crm_events(tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,cart_session_id,conversation_id,value,metadata)
      values(v_tenant_id,v_contact_id,v_opp_id,'delivery_status_changed',v_channel,'erp',now(),new.id,new.cart_session_id,coalesce(new.source_conversation_id,new.ai_conversation_id),new.total,
        jsonb_build_object('from',old.delivery_status,'to',new.delivery_status));
    end if;
  end if;
  return new;
exception when others then
  -- The CRM is a projection. It must not abort an order, checkout or cart event.
  -- SQLSTATE is logged for monitoring; no PII or sensitive payload is logged.
  raise warning 'crm_projection_nonblocking_failure: trigger=%, sqlstate=%', TG_NAME, SQLSTATE;
  return new;
end
$function$;
