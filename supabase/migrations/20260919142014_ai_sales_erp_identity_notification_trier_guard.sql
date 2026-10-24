
-- ERP IA/WhatsApp: identidade, indicadores, notificação e bloqueio Trier
alter table public.orders
  add column if not exists order_code text,
  add column if not exists external_idempotency_key text,
  add column if not exists source_conversation_id text,
  add column if not exists source text not null default 'site',
  add column if not exists created_by text,
  add column if not exists ai_conversation_id text,
  add column if not exists seller_notified_at timestamptz,
  add column if not exists trier_dispatched_at timestamptz,
  add column if not exists trier_eligible boolean not null default true,
  add column if not exists seller_notification_status text not null default 'pending';

update public.orders
set order_code = 'ADM-' || to_char(created_at, 'YYMMDD') || '-' ||
  upper(substr(replace(id::text, '-', ''), 1, 6))
where order_code is null;

update public.orders
set source = case
  when sales_channel = 'whatsapp' then 'ia'
  else coalesce(source, sales_channel, 'site')
end,
created_by = case
  when sales_channel = 'whatsapp' or source = 'ia' then coalesce(created_by, 'ia')
  else created_by
end,
trier_eligible = case
  when sales_channel = 'whatsapp' or source = 'ia' then false
  else coalesce(trier_eligible, true)
end,
seller_notification_status = coalesce(seller_notification_status, 'pending')
where sales_channel = 'whatsapp' or source = 'ia' or source is null;

drop trigger if exists trg_orders_set_order_code on public.orders;
create or replace function public.set_order_code()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.order_code is null or btrim(new.order_code) = '' then
    new.order_code := 'ADM-' || to_char(coalesce(new.created_at, now()), 'YYMMDD') || '-' ||
      upper(substr(replace(new.id::text, '-', ''), 1, 6));
  end if;
  return new;
end;
$$;
create trigger trg_orders_set_order_code
before insert on public.orders for each row execute function public.set_order_code();

create unique index if not exists orders_order_code_unique on public.orders(order_code);
create unique index if not exists orders_external_idempotency_unique
  on public.orders(external_idempotency_key) where external_idempotency_key is not null;
create index if not exists orders_sales_channel_created_at_idx
  on public.orders(sales_channel, created_at desc);
create index if not exists orders_source_created_at_idx
  on public.orders(source, created_at desc);
create index if not exists orders_ai_conversation_idx
  on public.orders(ai_conversation_id) where ai_conversation_id is not null;
create index if not exists orders_pending_seller_notification_idx
  on public.orders(seller_notification_status, created_at desc) where source = 'ia';
create index if not exists orders_trier_eligible_idx
  on public.orders(trier_eligible, created_at desc);

alter table public.orders alter column order_code set not null;

create or replace view public.ai_sales_summary as
select
  date_trunc('day', created_at)::date as sale_date,
  count(*)::integer as orders_count,
  coalesce(sum(total), 0)::numeric(12,2) as gross_total,
  coalesce(avg(total), 0)::numeric(12,2) as average_ticket,
  count(*) filter (where order_status in ('entregue','concluido'))::integer as completed_count,
  count(*) filter (where status in ('cancelado','cancelled') or order_status in ('cancelado','cancelled'))::integer as cancelled_count
from public.orders
where source = 'ia' or sales_channel = 'whatsapp'
group by 1;

create or replace function public.guard_ai_order_trier()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(new.sales_channel, '') = 'whatsapp' or coalesce(new.source, '') = 'ia' then
    new.source := 'ia';
    new.created_by := coalesce(new.created_by, 'ia');
    new.trier_eligible := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_ai_order_trier on public.orders;
create trigger trg_guard_ai_order_trier
before insert or update on public.orders
for each row execute function public.guard_ai_order_trier();

create or replace function public.notify_ai_order_seller()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(new.source, '') = 'ia'
     and coalesce(new.payment_status, '') = 'approved'
     and coalesce(new.seller_notification_status, 'pending') = 'pending' then
    insert into public.admin_notifications(type, title, message, order_id)
    values (
      'ai_order_received',
      'Venda via WhatsApp/IA aguardando atendimento',
      'Novo pedido da IA/WhatsApp: ' || coalesce(new.order_code, left(new.id::text, 8)),
      new.id
    );
    new.seller_notification_status := 'sent';
    new.seller_notified_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_ai_order_seller on public.orders;
create trigger trg_notify_ai_order_seller
before insert or update on public.orders
for each row execute function public.notify_ai_order_seller();

comment on column public.orders.trier_eligible is 'Define se o pedido pode ser enviado ao Trier; vendas IA ficam false';
comment on column public.orders.seller_notification_status is 'Status do aviso interno: pending, sent ou failed';
