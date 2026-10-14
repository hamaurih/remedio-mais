-- Link checkout funnel sessions to orders by authenticated user when the client
-- did not explicitly send cart_session_id, and treat created-but-unpaid orders as payment abandonment.
create or replace function public.sync_cart_funnel_from_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session uuid;
begin
  v_session := new.cart_session_id;

  if v_session is null then
    select s.id into v_session
    from public.cart_funnel_sessions s
    where (s.order_id = new.id)
       or (s.user_id = new.user_id and s.converted_at is null and s.cleared_at is null)
    order by (s.order_id = new.id) desc,
             s.checkout_started_at desc nulls last,
             s.last_activity_at desc
    limit 1;
  end if;

  if v_session is null then return new; end if;

  update public.cart_funnel_sessions
  set user_id = coalesce(new.user_id, user_id),
      order_id = new.id,
      order_created_at = coalesce(order_created_at, new.created_at, now()),
      stage = case when new.payment_status = 'approved' then 'purchase' else 'order_created' end,
      status = case when new.payment_status = 'approved' then 'converted' else status end,
      converted_at = case when new.payment_status = 'approved' then coalesce(converted_at, new.paid_at, now()) else converted_at end,
      last_activity_at = now(),
      updated_at = now()
  where id = v_session;

  if new.cart_session_id is null then
    update public.orders set cart_session_id = v_session where id = new.id and cart_session_id is null;
  end if;
  return new;
end;
$$;

create or replace function public.admin_cart_funnel_summary(p_hours integer default 168)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff timestamptz := now() - make_interval(hours => greatest(1, least(coalesce(p_hours,168), 2160)));
  v_result jsonb;
begin
  if not app_security.has_role(auth.uid(), 'admin'::app_role) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'window_hours', p_hours,
    'sessions', count(*) filter (where coalesce(first_item_at, created_at) >= v_cutoff),
    'active_now', count(*) filter (where item_count > 0 and converted_at is null and cleared_at is null and last_activity_at >= now() - interval '30 minutes'),
    'stalled_carts', count(*) filter (where item_count > 0 and converted_at is null and cleared_at is null and checkout_started_at is null and last_activity_at < now() - interval '30 minutes' and last_activity_at >= v_cutoff),
    'checkout_started', count(*) filter (where checkout_started_at >= v_cutoff),
    'checkout_abandoned', count(*) filter (where checkout_started_at is not null and converted_at is null and cleared_at is null and order_created_at is null and last_activity_at < now() - interval '30 minutes' and last_activity_at >= v_cutoff),
    'payment_attempted', count(*) filter (where coalesce(payment_attempted_at, order_created_at) >= v_cutoff),
    'payment_abandoned', count(*) filter (where order_created_at is not null and converted_at is null and last_activity_at < now() - interval '15 minutes' and last_activity_at >= v_cutoff),
    'converted', count(*) filter (where converted_at >= v_cutoff),
    'abandoned_24h', count(*) filter (where first_item_at is not null and converted_at is null and cleared_at is null and last_activity_at < now() - interval '24 hours' and last_activity_at >= v_cutoff),
    'cart_value_open', coalesce(sum(cart_value) filter (where item_count > 0 and converted_at is null and cleared_at is null),0),
    'conversion_rate_checkout', case when count(*) filter (where checkout_started_at >= v_cutoff) = 0 then 0 else round(100.0 * count(*) filter (where converted_at >= v_cutoff) / nullif(count(*) filter (where checkout_started_at >= v_cutoff),0), 2) end
  ) into v_result
  from public.cart_funnel_sessions
  where last_activity_at >= v_cutoff or converted_at >= v_cutoff or checkout_started_at >= v_cutoff;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.admin_cart_funnel_list(p_limit integer default 100, p_filter text default 'all')
returns table(
  session_id uuid, user_id uuid, customer_name text, customer_email text, customer_phone text,
  classification text, stage text, status text, cart_value numeric, item_count integer,
  payment_method text, order_id uuid, first_item_at timestamptz, checkout_started_at timestamptz,
  payment_attempted_at timestamptz, converted_at timestamptz, last_activity_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not app_security.has_role(auth.uid(), 'admin'::app_role) then raise exception 'forbidden'; end if;
  return query
  select s.id, s.user_id, p.full_name, p.email, p.phone,
    case
      when s.converted_at is not null then 'comprou'
      when s.order_created_at is not null and s.last_activity_at < now() - interval '15 minutes' then 'pagamento_abandonado'
      when s.checkout_started_at is not null and s.last_activity_at < now() - interval '30 minutes' then 'checkout_abandonado'
      when s.item_count > 0 and s.last_activity_at < now() - interval '30 minutes' then 'carrinho_parado'
      when s.item_count > 0 then 'carrinho_ativo'
      when s.cleared_at is not null then 'limpo'
      else 'ativo'
    end,
    s.stage, s.status, s.cart_value, s.item_count, s.payment_method, s.order_id,
    s.first_item_at, s.checkout_started_at, coalesce(s.payment_attempted_at,s.order_created_at), s.converted_at, s.last_activity_at
  from public.cart_funnel_sessions s
  left join public.profiles p on p.id = s.user_id
  where case lower(coalesce(p_filter,'all'))
    when 'stalled' then s.item_count > 0 and s.converted_at is null and s.cleared_at is null and s.last_activity_at < now() - interval '30 minutes'
    when 'checkout' then s.checkout_started_at is not null and s.converted_at is null
    when 'payment' then s.order_created_at is not null and s.converted_at is null
    when 'converted' then s.converted_at is not null
    else true end
  order by s.last_activity_at desc
  limit greatest(1, least(coalesce(p_limit,100),500));
end;
$$;
