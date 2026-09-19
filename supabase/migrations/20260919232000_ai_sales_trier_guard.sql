-- Proteção de banco: pedidos WhatsApp/IA não vão ao Trier nesta fase
create or replace function public.guard_ai_order_trier()
returns trigger
language plpgsql
security definer
set search_path = public
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

-- Notificação interna para vendedores quando o pagamento da venda IA for aprovado.
create or replace function public.notify_ai_order_seller()
returns trigger
language plpgsql
security definer
set search_path = public
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

comment on function public.guard_ai_order_trier() is 'Marca vendas IA/WhatsApp como inelegíveis para envio ao Trier';
comment on function public.notify_ai_order_seller() is 'Cria notificação interna de venda originada pela IA após aprovação do pagamento';
