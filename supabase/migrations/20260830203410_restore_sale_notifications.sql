create or replace function public.notify_paid_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status in ('approved','paid','pago')
     and (tg_op = 'INSERT' or coalesce(old.payment_status,'') not in ('approved','paid','pago')) then
    insert into public.admin_notifications(
      type,title,message,order_id,read,priority,role_target,metadata
    )
    select
      'order_paid',
      'Venda confirmada!',
      'Nova venda de R$ ' || to_char(coalesce(new.total,0), 'FM999G999G990D00') || ' confirmada no site.',
      new.id,
      false,
      'high',
      'admin',
      jsonb_build_object(
        'order_id', new.id,
        'customer_name', new.customer_name,
        'total', new.total,
        'payment_method', new.payment_method,
        'sales_channel', new.sales_channel
      )
    where not exists (
      select 1 from public.admin_notifications n
      where n.type='order_paid'
        and n.order_id=new.id
        and n.role_target='admin'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_paid_order on public.orders;
create trigger trg_notify_paid_order
after insert or update of payment_status on public.orders
for each row execute function public.notify_paid_order();
