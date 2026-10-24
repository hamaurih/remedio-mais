create or replace function public.guard_paid_order_payment_status()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if old.payment_status = 'approved' and new.payment_status in ('pending','authorized','aguardando_pagamento') then
    new.payment_status := old.payment_status;
    new.paid_at := coalesce(old.paid_at,new.paid_at);
    if new.order_status = 'aguardando_pagamento' then new.order_status := old.order_status; end if;
  end if;
  if old.paid_at is not null and new.paid_at is null then new.paid_at := old.paid_at; end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_paid_order_payment_status on public.orders;
create trigger trg_guard_paid_order_payment_status
before update of payment_status,paid_at,order_status on public.orders
for each row execute function public.guard_paid_order_payment_status();

create or replace function public.get_cielo_reconcile_key_secret()
returns text
language sql
security definer
set search_path=''
as $$
  select decrypted_secret from vault.decrypted_secrets where name='cielo_reconcile_key' limit 1;
$$;
revoke all on function public.get_cielo_reconcile_key_secret() from public,anon,authenticated;
grant execute on function public.get_cielo_reconcile_key_secret() to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name='cielo_reconcile_key') then
    perform vault.create_secret(replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),'cielo_reconcile_key','Internal key for scheduled Cielo reconciliation');
  end if;
end $$;

create or replace function public.invoke_cielo_reconciliation_internal()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_key text;
  v_request_id bigint;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name='cielo_reconcile_key' limit 1;
  if v_key is null then raise exception 'Cielo reconcile key not configured'; end if;
  select net.http_post(
    url := 'https://jzltdocmvvdlyaukwzix.supabase.co/functions/v1/cielo-reconcile-pending',
    headers := jsonb_build_object('Content-Type','application/json','x-cielo-reconcile-key',v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.invoke_cielo_reconciliation_internal() from public,anon,authenticated;
grant execute on function public.invoke_cielo_reconciliation_internal() to postgres,service_role;


-- Preview replay: Cielo reconciliation cron intentionally not scheduled.
