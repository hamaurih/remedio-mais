-- Identificação e indicadores das vendas originadas pela IA
alter table public.orders
  add column if not exists source text not null default 'site',
  add column if not exists created_by text,
  add column if not exists ai_conversation_id text,
  add column if not exists seller_notified_at timestamptz,
  add column if not exists trier_dispatched_at timestamptz;

update public.orders
set source = case when sales_channel = 'whatsapp' then 'ia' else coalesce(source, sales_channel, 'site') end
where source is null or source = 'site' and sales_channel = 'whatsapp';

create index if not exists orders_source_created_at_idx
  on public.orders(source, created_at desc);

create index if not exists orders_ai_conversation_idx
  on public.orders(ai_conversation_id)
  where ai_conversation_id is not null;

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

comment on column public.orders.source is 'Origem comercial da venda: site, ia, balcão, telefone ou outro';
comment on column public.orders.created_by is 'Responsável pela criação: ia, vendedor ou usuário';
comment on column public.orders.ai_conversation_id is 'Identificador da conversa que originou a venda';
