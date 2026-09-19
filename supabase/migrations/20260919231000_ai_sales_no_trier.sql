-- Vendas originadas pela IA: notificação interna e sem envio automático ao Trier
alter table public.orders
  add column if not exists trier_eligible boolean not null default true,
  add column if not exists seller_notification_status text not null default 'pending';

update public.orders
set
  source = 'ia',
  created_by = coalesce(created_by, 'ia'),
  trier_eligible = false,
  seller_notification_status = coalesce(seller_notification_status, 'pending')
where sales_channel = 'whatsapp' or source = 'ia';

create index if not exists orders_pending_seller_notification_idx
  on public.orders(seller_notification_status, created_at desc)
  where source = 'ia';

create index if not exists orders_trier_eligible_idx
  on public.orders(trier_eligible, created_at desc);

comment on column public.orders.trier_eligible is 'Define se o pedido pode ser enviado ao Trier; vendas da IA ficam false nesta fase';
comment on column public.orders.seller_notification_status is 'Status do aviso interno: pending, sent ou failed';
