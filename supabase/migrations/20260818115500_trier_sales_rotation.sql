-- Minimal sales-history layer used only to determine product rotation.
-- Deliberately stores NO customer identity, address, phone or payment data.

create table if not exists public.trier_sales_rotation_items (
  sale_key text primary key,
  sale_ref text not null,
  trier_product_id text not null,
  sold_at date not null,
  quantity numeric not null default 0,
  branch_code text,
  ingested_at timestamptz not null default now()
);

alter table public.trier_sales_rotation_items enable row level security;
revoke all on public.trier_sales_rotation_items from public,anon,authenticated;
grant all on public.trier_sales_rotation_items to service_role;
create index if not exists idx_trier_sales_rotation_product_date on public.trier_sales_rotation_items(trier_product_id,sold_at desc);
create index if not exists idx_trier_sales_rotation_date on public.trier_sales_rotation_items(sold_at desc);

create table if not exists public.trier_rotation_sync_state (
  id integer primary key default 1 check (id=1),
  period_start date not null,
  period_end date not null,
  next_offset integer not null default 0,
  page_size integer not null default 200,
  complete boolean not null default false,
  last_run_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.trier_rotation_sync_state enable row level security;
revoke all on public.trier_rotation_sync_state from public,anon,authenticated;
grant all on public.trier_rotation_sync_state to service_role;

insert into public.trier_rotation_sync_state(id,period_start,period_end,next_offset,page_size,complete)
values (1,current_date-90,current_date,0,200,false)
on conflict (id) do nothing;

create or replace function public.refresh_trier_product_rotation()
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_count integer;
begin
  insert into public.trier_product_rotation(
    trier_product_id,last_sale_at,units_30d,units_90d,units_180d,units_365d,orders_90d,source,synced_at
  )
  select
    s.trier_product_id,
    max(s.sold_at)::timestamptz,
    coalesce(sum(s.quantity) filter (where s.sold_at >= current_date-30),0)::bigint,
    coalesce(sum(s.quantity) filter (where s.sold_at >= current_date-90),0)::bigint,
    coalesce(sum(s.quantity) filter (where s.sold_at >= current_date-180),0)::bigint,
    coalesce(sum(s.quantity) filter (where s.sold_at >= current_date-365),0)::bigint,
    count(distinct s.sale_ref) filter (where s.sold_at >= current_date-90)::bigint,
    'trier_sales',now()
  from public.trier_sales_rotation_items s
  where s.sold_at >= current_date-365
  group by s.trier_product_id
  on conflict (trier_product_id) do update set
    last_sale_at=excluded.last_sale_at,
    units_30d=excluded.units_30d,
    units_90d=excluded.units_90d,
    units_180d=excluded.units_180d,
    units_365d=excluded.units_365d,
    orders_90d=excluded.orders_90d,
    source='trier_sales',
    synced_at=now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
revoke all on function public.refresh_trier_product_rotation() from public,anon,authenticated;
grant execute on function public.refresh_trier_product_rotation() to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name='trier_rotation_sync_key') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'trier_rotation_sync_key','Internal key for Trier sales rotation sync');
  end if;
end $$;

create or replace function public.get_trier_rotation_sync_key_secret()
returns text language sql security definer set search_path=''
as $$ select decrypted_secret from vault.decrypted_secrets where name='trier_rotation_sync_key' limit 1 $$;
revoke all on function public.get_trier_rotation_sync_key_secret() from public,anon,authenticated;
grant execute on function public.get_trier_rotation_sync_key_secret() to service_role;

create or replace function public.invoke_trier_rotation_sync_internal(_max_pages integer default 5)
returns bigint
language plpgsql security definer set search_path=''
as $function$
declare v_key text; v_request_id bigint;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name='trier_rotation_sync_key' limit 1;
  if v_key is null then raise exception 'Rotation sync key not configured'; end if;
  select net.http_post(
    url:='https://jzltdocmvvdlyaukwzix.supabase.co/functions/v1/trier-sales-rotation',
    headers:=jsonb_build_object('Content-Type','application/json','x-rotation-sync-key',v_key),
    body:=jsonb_build_object('maxPages',least(greatest(1,_max_pages),10)),
    timeout_milliseconds:=120000
  ) into v_request_id;
  return v_request_id;
end;
$function$;
revoke all on function public.invoke_trier_rotation_sync_internal(integer) from public,anon,authenticated;
grant execute on function public.invoke_trier_rotation_sync_internal(integer) to service_role;
