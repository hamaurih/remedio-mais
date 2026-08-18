-- Internal auth + invoker-safe view for the prioritized Trier synchronizer.
-- The secret is generated inside Vault and never leaves Supabase.

alter view public.product_sync_priority set (security_invoker = true);

do $$
begin
  if not exists (select 1 from vault.secrets where name='trier_priority_sync_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'trier_priority_sync_key',
      'Internal key for priority Trier product synchronization'
    );
  end if;
end $$;

create or replace function public.get_trier_priority_sync_key_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.name='trier_priority_sync_key'
  limit 1
$$;

revoke all on function public.get_trier_priority_sync_key_secret() from public,anon,authenticated;
grant execute on function public.get_trier_priority_sync_key_secret() to service_role;

create or replace function public.invoke_trier_priority_sync_internal(_limit integer default 120)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key text;
  v_request_id bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name='trier_priority_sync_key'
  limit 1;

  if v_key is null then raise exception 'Priority sync key not configured'; end if;

  select net.http_post(
    url := 'https://jzltdocmvvdlyaukwzix.supabase.co/functions/v1/trier-priority-sync',
    headers := jsonb_build_object('Content-Type','application/json','x-priority-sync-key',v_key),
    body := jsonb_build_object('limit',least(greatest(1,_limit),250)),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$function$;

revoke all on function public.invoke_trier_priority_sync_internal(integer) from public,anon,authenticated;
grant execute on function public.invoke_trier_priority_sync_internal(integer) to service_role;
