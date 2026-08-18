-- Internal wrapper so bootstrap invocation never has to expose or reference
-- the plaintext Vault key outside the database.
create or replace function public.invoke_trier_bootstrap_internal(
  _start_offset integer,
  _max_pages integer default 15
)
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
  where name='trier_bootstrap_key'
  limit 1;

  if v_key is null then
    raise exception 'Bootstrap key not configured';
  end if;

  select net.http_post(
    url := 'https://jzltdocmvvdlyaukwzix.supabase.co/functions/v1/trier-bootstrap',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-bootstrap-key',v_key
    ),
    body := jsonb_build_object(
      'startOffset', greatest(0,_start_offset),
      'maxPages', least(greatest(1,_max_pages),15)
    ),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$function$;

revoke all on function public.invoke_trier_bootstrap_internal(integer,integer) from public,anon,authenticated;
grant execute on function public.invoke_trier_bootstrap_internal(integer,integer) to service_role;
