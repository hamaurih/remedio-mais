create schema if not exists recovery;
revoke all on schema recovery from public, anon, authenticated;
grant usage on schema recovery to service_role, postgres;

create table if not exists recovery.trier_settings_before_reactivation_20260830 as
select * from public.trier_settings where false;
insert into recovery.trier_settings_before_reactivation_20260830
select * from public.trier_settings where id=1
and not exists (select 1 from recovery.trier_settings_before_reactivation_20260830 where id=1);
revoke all on recovery.trier_settings_before_reactivation_20260830 from public, anon, authenticated;
grant select,insert,update,delete on recovery.trier_settings_before_reactivation_20260830 to service_role, postgres;

create or replace function public.fanout_operational_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role_target <> 'admin' then return new; end if;

  if new.type = 'order_paid' then
    insert into public.admin_notifications(type,title,message,order_id,read,priority,role_target,target_user_id,metadata)
    select 'order_paid','Venda confirmada!',coalesce(new.message,'Uma nova venda foi confirmada no site.'),new.order_id,false,'high','seller',ur.user_id,coalesce(new.metadata,'{}'::jsonb)
    from public.user_roles ur
    where ur.role='seller'
      and not exists (
        select 1 from public.admin_notifications n
        where n.type='order_paid' and n.order_id is not distinct from new.order_id
          and n.role_target='seller' and n.target_user_id=ur.user_id
      );
  elsif new.type = 'prescription_received' then
    insert into public.admin_notifications(type,title,message,order_id,read,priority,role_target,target_user_id,metadata)
    select 'prescription_received','Receita aguardando aprovação!','Uma nova receita foi enviada. Abra a fila para analisar e aprovar.',null,false,'high','seller',ur.user_id,coalesce(new.metadata,'{}'::jsonb)
    from public.user_roles ur
    join public.seller_permissions sp on sp.user_id=ur.user_id
    where ur.role='seller' and sp.can_approve_prescriptions=true
      and not exists (
        select 1 from public.admin_notifications n
        where n.type='prescription_received' and n.role_target='seller' and n.target_user_id=ur.user_id
          and coalesce(n.metadata->>'prescription_id','')=coalesce(new.metadata->>'prescription_id','')
      );
  end if;
  return new;
end;
$$;
revoke all on function public.fanout_operational_notification() from public, anon, authenticated;

drop trigger if exists trg_fanout_operational_notification on public.admin_notifications;
create trigger trg_fanout_operational_notification
after insert on public.admin_notifications
for each row execute function public.fanout_operational_notification();

create or replace function public.get_trier_full_sync_key_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name='trier_full_sync_key' limit 1;
$$;
revoke all on function public.get_trier_full_sync_key_secret() from public, anon, authenticated;
grant execute on function public.get_trier_full_sync_key_secret() to service_role;

create or replace function public.invoke_trier_full_sync_internal()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_request_id bigint;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name='trier_full_sync_key' limit 1;
  if v_key is null then raise exception 'Full sync key not configured'; end if;
  select net.http_post(
    url := 'https://jzltdocmvvdlyaukwzix.supabase.co/functions/v1/trier-scheduled-dispatch',
    headers := jsonb_build_object('Content-Type','application/json','x-trier-schedule-key',v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.invoke_trier_full_sync_internal() from public, anon, authenticated;
grant execute on function public.invoke_trier_full_sync_internal() to postgres, service_role;
