create or replace function private.aes_crm_dispatch(
  p_entity_type text, p_entity_id uuid, p_order_id uuid, p_phone text,
  p_name text, p_email text, p_event text, p_order_status text,
  p_payment_status text, p_prescription_status text, p_fulfillment_status text,
  p_delivery_status text, p_refund_status text, p_message text
) returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private', 'vault', 'net', 'pg_temp'
as $$
declare
  v_url text;
  v_token text;
  v_request_id bigint;
  v_log_id uuid;
  v_phone text;
  v_payload jsonb;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if v_phone = '' then return; end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'aes_crm_webhook_url' limit 1;
  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'aes_crm_webhook_token' limit 1;

  if coalesce(v_url, '') = '' or coalesce(v_token, '') = '' then
    raise warning 'A&S CRM dispatch skipped: webhook configuration is incomplete';
    return;
  end if;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'event_id', p_entity_type || ':' || p_entity_id::text,
    'event', p_event,
    'order_id', coalesce(p_order_id::text, p_entity_id::text),
    'phone', v_phone,
    'name', nullif(trim(p_name), ''),
    'email', nullif(trim(p_email), ''),
    'message', p_message,
    'order_status', p_order_status,
    'payment_status', p_payment_status,
    'prescription_status', p_prescription_status,
    'fulfillment_status', p_fulfillment_status,
    'delivery_status', p_delivery_status,
    'refund_status', p_refund_status,
    'funnel_stage', private.aes_crm_funnel_stage(
      p_payment_status, p_order_status, p_fulfillment_status, p_delivery_status, p_refund_status
    ),
    'source', 'atacadao_erp',
    'occurred_at', now()
  ));

  insert into private.aes_crm_delivery_log (
    entity_type, entity_id, order_id, event_type, delivery_status
  ) values (
    p_entity_type, p_entity_id, p_order_id, p_event, 'queued'
  ) returning id into v_log_id;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-AES-Webhook-Token', v_token
    ),
    body := v_payload,
    timeout_milliseconds := 8000
  ) into v_request_id;

  update private.aes_crm_delivery_log
  set request_id = v_request_id, delivery_status = 'dispatched', dispatched_at = now()
  where id = v_log_id;
exception when others then
  if v_log_id is not null then
    update private.aes_crm_delivery_log
    set delivery_status = 'failed', error_message = left(sqlerrm, 500)
    where id = v_log_id;
  end if;
  raise warning 'A&S CRM dispatch failed for %/%: %', p_entity_type, p_entity_id, sqlerrm;
end;
$$;
