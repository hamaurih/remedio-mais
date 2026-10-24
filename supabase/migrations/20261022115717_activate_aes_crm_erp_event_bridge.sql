
create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.aes_crm_delivery_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  order_id uuid null,
  request_id bigint null,
  event_type text not null,
  delivery_status text not null default 'queued',
  error_message text null,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz null
);
revoke all on table private.aes_crm_delivery_log from public;

-- Preview replay: A&S webhook secret intentionally not provisioned.


create or replace function private.aes_crm_funnel_stage(
  p_payment_status text,
  p_order_status text,
  p_fulfillment_status text,
  p_delivery_status text,
  p_refund_status text default null
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when lower(coalesce(p_refund_status, '')) in ('approved','refunded','completed','concluido','concluído')
      or lower(coalesce(p_order_status, '')) in ('cancelled','canceled','cancelado') then 'Perdido'
    when lower(coalesce(p_delivery_status, '')) in ('delivered','entregue','completed','concluido','concluído') then 'Concluído'
    when lower(coalesce(p_delivery_status, '')) in ('out_for_delivery','em_rota','em_entrega','in_transit','em_transito','em trânsito') then 'Em Entrega'
    when lower(coalesce(p_fulfillment_status, '')) in ('separated','separado','ready','pronto','processing','em_separacao','em separação') then 'Processamento e Separação'
    when lower(coalesce(p_payment_status, '')) in ('approved','paid','pago') then 'Processamento e Separação'
    when lower(coalesce(p_order_status, '')) in ('pago','paid','processing','em_separacao','em separação') then 'Processamento e Separação'
    else 'Triagem'
  end
$$;
revoke all on function private.aes_crm_funnel_stage(text,text,text,text,text) from public;

create or replace function private.aes_crm_dispatch(
  p_entity_type text,
  p_entity_id uuid,
  p_order_id uuid,
  p_phone text,
  p_name text,
  p_email text,
  p_event text,
  p_order_status text,
  p_payment_status text,
  p_prescription_status text,
  p_fulfillment_status text,
  p_delivery_status text,
  p_refund_status text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, extensions, pg_temp
as $$
declare
  v_url text;
  v_request_id bigint;
  v_log_id uuid;
  v_phone text;
  v_payload jsonb;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if v_phone = '' then
    return;
  end if;

  select decrypted_secret
    into v_url
  from vault.decrypted_secrets
  where name = 'aes_crm_webhook_url'
  limit 1;

  if coalesce(v_url, '') = '' then
    raise warning 'A&S CRM dispatch skipped: webhook URL secret is missing';
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

  select extensions.net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_payload,
    timeout_milliseconds := 8000
  ) into v_request_id;

  update private.aes_crm_delivery_log
    set request_id = v_request_id,
        delivery_status = 'dispatched',
        dispatched_at = now()
  where id = v_log_id;
exception when others then
  if v_log_id is not null then
    update private.aes_crm_delivery_log
      set delivery_status = 'failed',
          error_message = left(sqlerrm, 500)
    where id = v_log_id;
  end if;
  raise warning 'A&S CRM dispatch failed for %/%: %', p_entity_type, p_entity_id, sqlerrm;
end;
$$;
revoke all on function private.aes_crm_dispatch(text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text) from public;

create or replace function private.aes_crm_dispatch_order_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_event text;
  v_message text;
begin
  select * into v_order from public.orders where id = new.order_id;
  if not found then
    return new;
  end if;

  v_event := case new.type
    when 'created' then 'order_created'
    when 'payment_status' then 'payment_updated'
    when 'fulfillment_status' then 'fulfillment_updated'
    when 'delivery_status' then 'delivery_updated'
    when 'order_status' then 'order_updated'
    else 'order_event'
  end;

  v_message := case v_event
    when 'order_created' then 'Pedido ' || coalesce(v_order.order_code, left(v_order.id::text, 8)) || ' criado no site.'
    when 'payment_updated' then 'Pedido ' || coalesce(v_order.order_code, left(v_order.id::text, 8)) || ': pagamento ' || coalesce(v_order.payment_status, 'atualizado') || '.'
    when 'fulfillment_updated' then 'Pedido ' || coalesce(v_order.order_code, left(v_order.id::text, 8)) || ': separação ' || coalesce(v_order.fulfillment_status, 'atualizada') || '.'
    when 'delivery_updated' then 'Pedido ' || coalesce(v_order.order_code, left(v_order.id::text, 8)) || ': entrega ' || coalesce(v_order.delivery_status, 'atualizada') || '.'
    else 'Pedido ' || coalesce(v_order.order_code, left(v_order.id::text, 8)) || ': status ' || coalesce(v_order.order_status, 'atualizado') || '.'
  end;

  perform private.aes_crm_dispatch(
    'order_event', new.id, v_order.id, v_order.customer_phone, v_order.customer_name,
    v_order.customer_email, v_event, v_order.order_status, v_order.payment_status,
    null, v_order.fulfillment_status, v_order.delivery_status, null, v_message
  );
  return new;
end;
$$;
revoke all on function private.aes_crm_dispatch_order_event() from public;

create or replace function private.aes_crm_dispatch_prescription()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_event text;
  v_message text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  v_event := case
    when tg_op = 'INSERT' then 'prescription_received'
    else 'prescription_updated'
  end;
  v_message := case
    when tg_op = 'INSERT' then 'Receita recebida e aguardando análise.'
    else 'Receita atualizada: ' || coalesce(new.status, 'em análise') || '.'
  end;

  perform private.aes_crm_dispatch(
    'prescription', new.id, null, new.customer_phone, new.customer_name, null,
    v_event, null, null, new.status, null, null, null, v_message
  );
  return new;
end;
$$;
revoke all on function private.aes_crm_dispatch_prescription() from public;

create or replace function private.aes_crm_dispatch_refund()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select * into v_order from public.orders where id = new.order_id;
  if not found then
    return new;
  end if;

  perform private.aes_crm_dispatch(
    'refund_request', new.id, v_order.id, v_order.customer_phone, v_order.customer_name,
    v_order.customer_email, 'refund_updated', v_order.order_status, v_order.payment_status,
    null, v_order.fulfillment_status, v_order.delivery_status, new.status,
    'Pedido ' || coalesce(v_order.order_code, left(v_order.id::text, 8)) || ': reembolso ' || coalesce(new.status, 'atualizado') || '.'
  );
  return new;
end;
$$;
revoke all on function private.aes_crm_dispatch_refund() from public;

drop trigger if exists trg_aes_crm_order_event on public.order_events;
create trigger trg_aes_crm_order_event
after insert on public.order_events
for each row execute function private.aes_crm_dispatch_order_event();

drop trigger if exists trg_aes_crm_prescription on public.prescriptions;
create trigger trg_aes_crm_prescription
after insert or update of status on public.prescriptions
for each row execute function private.aes_crm_dispatch_prescription();

drop trigger if exists trg_aes_crm_refund_request on public.refund_requests;
create trigger trg_aes_crm_refund_request
after insert or update of status on public.refund_requests
for each row execute function private.aes_crm_dispatch_refund();
