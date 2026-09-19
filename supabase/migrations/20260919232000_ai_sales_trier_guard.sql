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

comment on function public.guard_ai_order_trier() is 'Impede envio automático de pedidos originados pela IA ao Trier';
