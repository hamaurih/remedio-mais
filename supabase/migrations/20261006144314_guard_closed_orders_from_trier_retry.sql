create or replace function public.enforce_closed_order_trier_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.trier_sent, false) = false
     and (
       lower(coalesce(new.status,'')) in ('finalizado','entregue','retirado')
       or lower(coalesce(new.fulfillment_status,'')) = 'delivered'
       or lower(coalesce(new.delivery_status,'')) = 'delivered'
     ) then
    new.trier_eligible := false;
    new.trier_sending_at := null;

    if new.trier_status is null
       or new.trier_status in ('error','blocked_product_inactive','pending','retrying') then
      new.trier_status := 'resolved_delivered_without_trier';
      new.trier_status_code := null;
      new.trier_last_error := null;
      new.trier_error_message := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_closed_order_trier_guard on public.orders;
create trigger trg_closed_order_trier_guard
before insert or update of status, fulfillment_status, delivery_status, trier_sent, trier_status
on public.orders
for each row
execute function public.enforce_closed_order_trier_guard();

update public.orders
set trier_eligible = false,
    trier_sending_at = null,
    trier_status = case
      when trier_status is null or trier_status in ('error','blocked_product_inactive','pending','retrying')
        then 'resolved_delivered_without_trier'
      else trier_status
    end,
    trier_status_code = case
      when trier_status is null or trier_status in ('error','blocked_product_inactive','pending','retrying') then null
      else trier_status_code
    end,
    trier_last_error = case
      when trier_status is null or trier_status in ('error','blocked_product_inactive','pending','retrying') then null
      else trier_last_error
    end,
    trier_error_message = case
      when trier_status is null or trier_status in ('error','blocked_product_inactive','pending','retrying') then null
      else trier_error_message
    end,
    updated_at = now()
where coalesce(trier_sent,false)=false
  and (
    lower(coalesce(status,'')) in ('finalizado','entregue','retirado')
    or lower(coalesce(fulfillment_status,''))='delivered'
    or lower(coalesce(delivery_status,''))='delivered'
  );

update public.admin_notifications n
set read=true,
    read_at=coalesce(n.read_at, now())
from public.orders o
where n.order_id=o.id
  and n.read=false
  and n.type in ('trier_order_failed','trier_order_action_required')
  and coalesce(o.trier_sent,false)=false
  and (
    lower(coalesce(o.status,'')) in ('finalizado','entregue','retirado')
    or lower(coalesce(o.fulfillment_status,''))='delivered'
    or lower(coalesce(o.delivery_status,''))='delivered'
  );
