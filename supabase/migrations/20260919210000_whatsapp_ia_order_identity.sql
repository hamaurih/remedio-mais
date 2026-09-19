-- Pedido WhatsApp/IA: identidade persistente e proteção contra duplicidade

alter table public.orders
  add column if not exists order_code text,
  add column if not exists external_idempotency_key text,
  add column if not exists source_conversation_id text,
  add column if not exists payment_method text,
  add column if not exists subtotal numeric(10,2),
  add column if not exists delivery_fee numeric(10,2) not null default 0,
  add column if not exists sales_channel text not null default 'site';

update public.orders
set order_code = 'ADM-' || to_char(created_at, 'YYMMDD') || '-' ||
  upper(substr(replace(id::text, '-', ''), 1, 6))
where order_code is null;

create or replace function public.set_order_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_code is null or btrim(new.order_code) = '' then
    new.order_code := 'ADM-' || to_char(coalesce(new.created_at, now()), 'YYMMDD') || '-' ||
      upper(substr(replace(new.id::text, '-', ''), 1, 6));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_set_order_code on public.orders;
create trigger trg_orders_set_order_code
before insert on public.orders
for each row execute function public.set_order_code();

create unique index if not exists orders_order_code_unique
  on public.orders(order_code);

create unique index if not exists orders_external_idempotency_unique
  on public.orders(external_idempotency_key)
  where external_idempotency_key is not null;

create index if not exists orders_sales_channel_created_at_idx
  on public.orders(sales_channel, created_at desc);

create index if not exists orders_source_conversation_idx
  on public.orders(source_conversation_id)
  where source_conversation_id is not null;

alter table public.orders
  alter column order_code set not null;

comment on column public.orders.order_code is 'Código público persistente do pedido, ex.: ADM-260919-A1B2C3';
comment on column public.orders.external_idempotency_key is 'Chave única para impedir duplicidade na criação via WhatsApp/IA';
comment on column public.orders.source_conversation_id is 'Identificador da conversa de origem, sem armazenar conteúdo da conversa';
