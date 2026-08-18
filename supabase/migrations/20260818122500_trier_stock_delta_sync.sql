-- Incremental Trier stock discovery. This avoids rescanning the full catalog.
-- It updates only products whose stock changed in the requested period.

create table if not exists public.trier_stock_sync_state (
  id integer primary key default 1 check (id=1),
  window_start timestamptz not null,
  window_end timestamptz not null,
  next_offset integer not null default 0,
  page_size integer not null default 200,
  complete boolean not null default false,
  last_run_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.trier_stock_sync_state enable row level security;
revoke all on public.trier_stock_sync_state from public,anon,authenticated;
grant all on public.trier_stock_sync_state to service_role;

insert into public.trier_stock_sync_state(id,window_start,window_end,next_offset,page_size,complete)
values (1,now()-interval '7 days',now(),0,200,false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from vault.secrets where name='trier_stock_delta_key') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'trier_stock_delta_key','Internal key for incremental Trier stock sync');
  end if;
end $$;

create or replace function public.get_trier_stock_delta_key_secret()
returns text language sql security definer set search_path=''
as $$ select decrypted_secret from vault.decrypted_secrets where name='trier_stock_delta_key' limit 1 $$;
revoke all on function public.get_trier_stock_delta_key_secret() from public,anon,authenticated;
grant execute on function public.get_trier_stock_delta_key_secret() to service_role;

create or replace function public.invoke_trier_stock_delta_internal(_max_pages integer default 5)
returns bigint
language plpgsql security definer set search_path=''
as $function$
declare v_key text; v_request_id bigint;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name='trier_stock_delta_key' limit 1;
  if v_key is null then raise exception 'Stock delta key not configured'; end if;
  select net.http_post(
    url:='https://jzltdocmvvdlyaukwzix.supabase.co/functions/v1/trier-stock-delta',
    headers:=jsonb_build_object('Content-Type','application/json','x-stock-delta-key',v_key),
    body:=jsonb_build_object('maxPages',least(greatest(1,_max_pages),10)),
    timeout_milliseconds:=120000
  ) into v_request_id;
  return v_request_id;
end;
$function$;
revoke all on function public.invoke_trier_stock_delta_internal(integer) from public,anon,authenticated;
grant execute on function public.invoke_trier_stock_delta_internal(integer) to service_role;
