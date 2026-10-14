-- First-party cart/checkout funnel tracking.
-- Keeps item detail internal to the pharmacy; Meta receives only separate marketing events.
create table if not exists public.cart_funnel_sessions (
  id uuid primary key,
  user_id uuid null,
  stage text not null default 'cart',
  status text not null default 'active',
  cart_value numeric(12,2) not null default 0,
  item_count integer not null default 0,
  items jsonb not null default '[]'::jsonb,
  payment_method text null,
  first_item_at timestamptz null,
  checkout_started_at timestamptz null,
  payment_attempted_at timestamptz null,
  order_created_at timestamptz null,
  converted_at timestamptz null,
  cleared_at timestamptz null,
  order_id uuid null,
  last_activity_at timestamptz not null default now(),
  last_path text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cart_funnel_sessions_user_idx on public.cart_funnel_sessions(user_id);
create index if not exists cart_funnel_sessions_activity_idx on public.cart_funnel_sessions(last_activity_at desc);
create index if not exists cart_funnel_sessions_stage_idx on public.cart_funnel_sessions(stage, status);
create index if not exists cart_funnel_sessions_order_idx on public.cart_funnel_sessions(order_id);

alter table public.cart_funnel_sessions enable row level security;
drop policy if exists "Admins read cart funnel" on public.cart_funnel_sessions;
create policy "Admins read cart funnel" on public.cart_funnel_sessions
for select using (app_security.has_role(auth.uid(), 'admin'::app_role));

alter table public.orders add column if not exists cart_session_id uuid null;
create index if not exists orders_cart_session_idx on public.orders(cart_session_id);

create or replace function public.track_cart_funnel(
  p_session_id uuid,
  p_event text,
  p_cart_value numeric default 0,
  p_item_count integer default 0,
  p_items jsonb default '[]'::jsonb,
  p_path text default null,
  p_payment_method text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_event text := lower(coalesce(p_event, 'snapshot'));
  v_items jsonb := case when jsonb_typeof(coalesce(p_items, '[]'::jsonb)) = 'array' then coalesce(p_items, '[]'::jsonb) else '[]'::jsonb end;
  v_count int := greatest(0, least(coalesce(p_item_count, 0), 200));
  v_value numeric := greatest(0, least(coalesce(p_cart_value, 0), 99999999));
begin
  if p_session_id is null then return; end if;
  if v_event not in ('snapshot','cart_changed','checkout_started','payment_attempted','cleared') then
    raise exception 'invalid funnel event';
  end if;
  if jsonb_array_length(v_items) > 200 then v_items := '[]'::jsonb; end if;

  insert into public.cart_funnel_sessions as s (
    id, user_id, stage, status, cart_value, item_count, items, payment_method,
    first_item_at, checkout_started_at, payment_attempted_at, cleared_at,
    last_activity_at, last_path, created_at, updated_at
  ) values (
    p_session_id, v_user,
    case when v_event='payment_attempted' then 'payment' when v_event='checkout_started' then 'checkout' when v_event='cleared' then 'cleared' else 'cart' end,
    case when v_event='cleared' then 'cleared' else 'active' end,
    case when v_event='cleared' then 0 else v_value end,
    case when v_event='cleared' then 0 else v_count end,
    case when v_event='cleared' then '[]'::jsonb else v_items end,
    case when v_event='payment_attempted' then nullif(p_payment_method,'') else null end,
    case when v_count>0 and v_event<>'cleared' then now() else null end,
    case when v_event='checkout_started' then now() else null end,
    case when v_event='payment_attempted' then now() else null end,
    case when v_event='cleared' then now() else null end,
    now(), left(coalesce(p_path,''),500), now(), now()
  )
  on conflict (id) do update set
    user_id = coalesce(v_user, s.user_id),
    stage = case
      when s.status='converted' then s.stage
      when v_event='payment_attempted' then 'payment'
      when v_event='checkout_started' and s.stage not in ('payment','order_created','purchase') then 'checkout'
      when v_event='cleared' then 'cleared'
      when s.stage in ('checkout','payment','order_created','purchase') then s.stage
      else 'cart' end,
    status = case when s.status='converted' then 'converted' when v_event='cleared' then 'cleared' else 'active' end,
    cart_value = case when v_event='cleared' then 0 else v_value end,
    item_count = case when v_event='cleared' then 0 else v_count end,
    items = case when v_event='cleared' then '[]'::jsonb else v_items end,
    payment_method = case when v_event='payment_attempted' then nullif(p_payment_method,'') else s.payment_method end,
    first_item_at = coalesce(s.first_item_at, case when v_count>0 and v_event<>'cleared' then now() end),
    checkout_started_at = coalesce(s.checkout_started_at, case when v_event='checkout_started' then now() end),
    payment_attempted_at = coalesce(s.payment_attempted_at, case when v_event='payment_attempted' then now() end),
    cleared_at = case when v_event='cleared' then now() else s.cleared_at end,
    last_activity_at = now(),
    last_path = left(coalesce(p_path,s.last_path,''),500),
    updated_at = now();
end;
$$;
grant execute on function public.track_cart_funnel(uuid,text,numeric,integer,jsonb,text,text) to anon, authenticated;

create or replace function public.sync_cart_funnel_from_order()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.cart_session_id is null then return new; end if;
  update public.cart_funnel_sessions
  set user_id=coalesce(new.user_id,user_id), order_id=new.id,
      order_created_at=coalesce(order_created_at,new.created_at,now()),
      stage=case when new.payment_status='approved' then 'purchase' else 'order_created' end,
      status=case when new.payment_status='approved' then 'converted' else status end,
      converted_at=case when new.payment_status='approved' then coalesce(converted_at,new.paid_at,now()) else converted_at end,
      last_activity_at=now(), updated_at=now()
  where id=new.cart_session_id;
  return new;
end; $$;

drop trigger if exists trg_sync_cart_funnel_from_order on public.orders;
create trigger trg_sync_cart_funnel_from_order after insert or update of payment_status on public.orders
for each row execute function public.sync_cart_funnel_from_order();

create or replace function public.admin_cart_funnel_summary(p_hours integer default 168)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_cutoff timestamptz := now()-make_interval(hours=>greatest(1,least(coalesce(p_hours,168),2160)));
  v_result jsonb;
begin
  if not app_security.has_role(auth.uid(),'admin'::app_role) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'window_hours',p_hours,
    'sessions',count(*) filter(where coalesce(first_item_at,created_at)>=v_cutoff),
    'active_now',count(*) filter(where item_count>0 and converted_at is null and cleared_at is null and last_activity_at>=now()-interval '30 minutes'),
    'stalled_carts',count(*) filter(where item_count>0 and converted_at is null and cleared_at is null and checkout_started_at is null and last_activity_at<now()-interval '30 minutes' and last_activity_at>=v_cutoff),
    'checkout_started',count(*) filter(where checkout_started_at>=v_cutoff),
    'checkout_abandoned',count(*) filter(where checkout_started_at is not null and converted_at is null and cleared_at is null and last_activity_at<now()-interval '30 minutes' and last_activity_at>=v_cutoff),
    'payment_attempted',count(*) filter(where payment_attempted_at>=v_cutoff),
    'payment_abandoned',count(*) filter(where payment_attempted_at is not null and converted_at is null and last_activity_at<now()-interval '15 minutes' and last_activity_at>=v_cutoff),
    'converted',count(*) filter(where converted_at>=v_cutoff),
    'abandoned_24h',count(*) filter(where first_item_at is not null and converted_at is null and cleared_at is null and last_activity_at<now()-interval '24 hours' and last_activity_at>=v_cutoff),
    'cart_value_open',coalesce(sum(cart_value) filter(where item_count>0 and converted_at is null and cleared_at is null),0),
    'conversion_rate_checkout',case when count(*) filter(where checkout_started_at>=v_cutoff)=0 then 0 else round(100.0*count(*) filter(where converted_at>=v_cutoff)/nullif(count(*) filter(where checkout_started_at>=v_cutoff),0),2) end
  ) into v_result
  from public.cart_funnel_sessions
  where last_activity_at>=v_cutoff or converted_at>=v_cutoff or checkout_started_at>=v_cutoff;
  return coalesce(v_result,'{}'::jsonb);
end; $$;
grant execute on function public.admin_cart_funnel_summary(integer) to authenticated;

create or replace function public.admin_cart_funnel_list(p_limit integer default 100,p_filter text default 'all')
returns table(session_id uuid,user_id uuid,customer_name text,customer_email text,customer_phone text,classification text,stage text,status text,cart_value numeric,item_count integer,payment_method text,order_id uuid,first_item_at timestamptz,checkout_started_at timestamptz,payment_attempted_at timestamptz,converted_at timestamptz,last_activity_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not app_security.has_role(auth.uid(),'admin'::app_role) then raise exception 'forbidden'; end if;
  return query
  select s.id,s.user_id,p.full_name,p.email,p.phone,
    case when s.converted_at is not null then 'comprou'
      when s.payment_attempted_at is not null and s.last_activity_at<now()-interval '15 minutes' then 'pagamento_abandonado'
      when s.checkout_started_at is not null and s.last_activity_at<now()-interval '30 minutes' then 'checkout_abandonado'
      when s.item_count>0 and s.last_activity_at<now()-interval '30 minutes' then 'carrinho_parado'
      when s.item_count>0 then 'carrinho_ativo'
      when s.cleared_at is not null then 'limpo' else 'ativo' end,
    s.stage,s.status,s.cart_value,s.item_count,s.payment_method,s.order_id,s.first_item_at,s.checkout_started_at,s.payment_attempted_at,s.converted_at,s.last_activity_at
  from public.cart_funnel_sessions s left join public.profiles p on p.id=s.user_id
  where case lower(coalesce(p_filter,'all'))
    when 'stalled' then s.item_count>0 and s.converted_at is null and s.cleared_at is null and s.last_activity_at<now()-interval '30 minutes'
    when 'checkout' then s.checkout_started_at is not null and s.converted_at is null
    when 'payment' then s.payment_attempted_at is not null and s.converted_at is null
    when 'converted' then s.converted_at is not null
    else true end
  order by s.last_activity_at desc limit greatest(1,least(coalesce(p_limit,100),500));
end; $$;
grant execute on function public.admin_cart_funnel_list(integer,text) to authenticated;
