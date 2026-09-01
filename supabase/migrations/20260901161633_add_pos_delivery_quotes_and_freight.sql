create table if not exists public.pos_delivery_quotes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  lat numeric,
  lng numeric,
  distance_km numeric,
  distance_source text,
  fee numeric not null check (fee >= 0),
  zone_label text,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  consumed_at timestamptz,
  consumed_by_sale_id uuid
);

create index if not exists idx_pos_delivery_quotes_user_expires
  on public.pos_delivery_quotes(user_id, expires_at desc);
create index if not exists idx_pos_delivery_quotes_store_expires
  on public.pos_delivery_quotes(store_id, expires_at desc);

alter table public.pos_delivery_quotes enable row level security;
revoke all on public.pos_delivery_quotes from anon, authenticated;

alter table public.pos_sales
  add column if not exists delivery_quote_id uuid references public.pos_delivery_quotes(id),
  add column if not exists delivery_address text,
  add column if not exists delivery_fee numeric not null default 0,
  add column if not exists delivery_distance_km numeric,
  add column if not exists delivery_lat numeric,
  add column if not exists delivery_lng numeric;

alter table public.orders
  add column if not exists delivery_distance_km numeric;

alter table public.pos_delivery_quotes
  drop constraint if exists pos_delivery_quotes_consumed_by_sale_id_fkey;
alter table public.pos_delivery_quotes
  add constraint pos_delivery_quotes_consumed_by_sale_id_fkey
  foreign key (consumed_by_sale_id) references public.pos_sales(id) on delete set null;

create or replace function public.pos_finalize_sale(_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s record; v_role public.pos_role; v_max numeric;
  v_session uuid := (_payload->>'session_id')::uuid;
  v_req text := nullif(_payload->>'client_request_id','');
  v_quote_id uuid := nullif(_payload->>'delivery_quote_id','')::uuid;
  v_sale_id uuid; v_sale_number bigint;
  it jsonb; pay jsonb; p record; q record;
  v_qty int; v_unit numeric; v_base numeric; v_item_disc numeric; v_item_total numeric;
  v_subtotal numeric := 0; v_disc_total numeric := 0; v_total numeric := 0;
  v_delivery_fee numeric := 0;
  v_paid numeric := 0; v_received_cash numeric := 0; v_cash_due numeric := 0; v_change numeric := 0;
  v_promo boolean; v_order_id uuid; existing record;
begin
  if uid is null then raise exception 'Não autenticado'; end if;
  if v_req is not null then
    select id, sale_number, order_id, subtotal, discount, total, change_amount
      into existing
      from public.pos_sales
     where client_request_id = v_req;
    if existing.id is not null then
      return jsonb_build_object(
        'sale_id', existing.id,
        'sale_number', existing.sale_number,
        'order_id', existing.order_id,
        'subtotal', existing.subtotal,
        'discount', existing.discount,
        'total', existing.total,
        'change', existing.change_amount,
        'duplicate', true
      );
    end if;
  end if;

  select * into s from public.cash_register_sessions where id=v_session;
  if s is null or s.status <> 'open' then raise exception 'Nenhum caixa aberto para esta venda'; end if;
  if not public.pos_is_operator(uid, s.store_id) then raise exception 'Sem permissão no PDV'; end if;
  v_role := public.pos_effective_role(uid, s.store_id);
  v_max := public.pos_max_discount(uid, s.store_id);

  if v_quote_id is not null then
    select * into q from public.pos_delivery_quotes where id = v_quote_id for update;
    if q is null then raise exception 'Cotação de frete não encontrada. Calcule novamente.'; end if;
    if q.user_id <> uid then raise exception 'Cotação de frete pertence a outro operador'; end if;
    if q.store_id <> s.store_id then raise exception 'Cotação de frete pertence a outra loja'; end if;
    if not q.allowed then raise exception 'Endereço fora da área de entrega'; end if;
    if q.expires_at <= now() then raise exception 'Cotação de frete expirada. Calcule novamente.'; end if;
    if q.consumed_at is not null then raise exception 'Cotação de frete já utilizada. Calcule novamente.'; end if;
    v_delivery_fee := round(coalesce(q.fee,0),2);
  end if;

  if jsonb_array_length(coalesce(_payload->'items','[]'::jsonb)) = 0 then raise exception 'Venda sem itens'; end if;

  insert into public.pos_sales(
    tenant_id, store_id, terminal_id, session_id, operator_id, status,
    customer_id, customer_name, customer_cpf, customer_phone, notes, client_request_id,
    discount_authorized_by, delivery_quote_id, delivery_address, delivery_fee,
    delivery_distance_km, delivery_lat, delivery_lng
  )
  values (
    s.tenant_id, s.store_id, s.terminal_id, s.id, uid, 'paid',
    nullif(_payload->>'customer_id','')::uuid, nullif(_payload->>'customer_name',''),
    nullif(_payload->>'customer_cpf',''), nullif(_payload->>'customer_phone',''),
    nullif(_payload->>'notes',''), v_req,
    case when coalesce((_payload->>'discount')::numeric,0) > 0 then uid end,
    v_quote_id,
    case when v_quote_id is not null then q.address else null end,
    v_delivery_fee,
    case when v_quote_id is not null then q.distance_km else null end,
    case when v_quote_id is not null then q.lat else null end,
    case when v_quote_id is not null then q.lng else null end
  )
  returning id, sale_number into v_sale_id, v_sale_number;

  for it in select * from jsonb_array_elements(_payload->'items') loop
    select * into p from public.products where id = (it->>'product_id')::uuid for update;
    if p is null then raise exception 'Produto não encontrado'; end if;
    v_qty := greatest(coalesce((it->>'quantity')::int,1),1);
    if coalesce(p.stock,0) < v_qty then
      raise exception 'Estoque insuficiente para %: disponível %', p.name, coalesce(p.stock,0);
    end if;

    v_base := coalesce(p.price,0);
    v_promo := p.promo_price is not null and p.promo_price > 0 and p.promo_price < coalesce(p.price, p.promo_price+1)
               and (p.promotion_start is null or p.promotion_start <= now())
               and (p.promotion_end is null or p.promotion_end >= now());
    v_unit := case when v_promo then p.promo_price else v_base end;
    if v_unit <= 0 then raise exception 'Produto % sem preço válido', p.name; end if;

    v_item_disc := greatest(coalesce((it->>'discount')::numeric,0),0);
    if v_item_disc > 0 and (v_item_disc / (v_unit * v_qty)) * 100 > v_max + 0.001 then
      raise exception 'Desconto acima do limite do seu perfil (% %%)', v_max;
    end if;
    v_item_total := round(v_unit * v_qty - v_item_disc, 2);
    if v_item_total < 0 then raise exception 'Desconto maior que o valor do item'; end if;

    insert into public.pos_sale_items(sale_id, product_id, product_name, trier_product_id, barcode, sku, image_url,
                                      quantity, base_price, unit_price, discount, total, promo_applied)
    values (v_sale_id, p.id, p.name, p.trier_product_id::text, coalesce(p.barcode, p.trier_barcode, p.manual_barcode),
            p.sku, p.image_url, v_qty, v_base, v_unit, v_item_disc, v_item_total, v_promo);

    update public.products set stock = coalesce(stock,0) - v_qty where id = p.id;
    insert into public.stock_movements(product_id, type, quantity, reason, source, created_by, metadata)
    values (p.id, 'saida', v_qty, 'Venda PDV #' || v_sale_number, 'pdv', uid,
            jsonb_build_object('pos_sale_id', v_sale_id, 'session_id', s.id));

    v_subtotal := v_subtotal + round(v_unit * v_qty, 2);
    v_disc_total := v_disc_total + v_item_disc;
  end loop;

  v_disc_total := v_disc_total + greatest(coalesce((_payload->>'discount')::numeric,0),0);
  if v_subtotal > 0 and (v_disc_total / v_subtotal) * 100 > v_max + 0.001 then
    raise exception 'Desconto total acima do limite do seu perfil (% %%)', v_max;
  end if;
  v_total := round(v_subtotal - v_disc_total + v_delivery_fee, 2);
  if v_total < 0 then raise exception 'Desconto maior que o total da venda'; end if;

  for pay in select * from jsonb_array_elements(coalesce(_payload->'payments','[]'::jsonb)) loop
    insert into public.pos_sale_payments(sale_id, method, amount, received_amount, installments)
    values (v_sale_id, (pay->>'method')::public.pos_payment_method,
            round((pay->>'amount')::numeric,2), nullif(pay->>'received_amount','')::numeric,
            nullif(pay->>'installments','')::int);
    v_paid := v_paid + round((pay->>'amount')::numeric,2);
    if (pay->>'method') = 'cash' then
      v_cash_due := v_cash_due + round((pay->>'amount')::numeric,2);
      v_received_cash := v_received_cash + coalesce(nullif(pay->>'received_amount','')::numeric, round((pay->>'amount')::numeric,2));
    end if;
  end loop;

  if round(v_paid,2) <> v_total then
    raise exception 'Soma dos pagamentos (%) diferente do total da venda (%)', v_paid, v_total;
  end if;
  v_change := greatest(round(v_received_cash - v_cash_due, 2), 0);

  insert into public.orders(
    customer_name, customer_phone, customer_cpf, customer_address,
    delivery_method, delivery_type, delivery_street,
    delivery_fee, delivery_status, delivery_lat, delivery_lng, delivery_distance_km,
    subtotal, discount, total, status, order_status, payment_status,
    payment_method, payment_gateway, sales_channel, notes, store_id
  )
  values (
    coalesce(nullif(_payload->>'customer_name',''),'Consumidor não identificado'),
    coalesce(nullif(_payload->>'customer_phone',''),'0000000000'),
    nullif(_payload->>'customer_cpf',''),
    case when v_quote_id is not null then q.address else null end,
    case when v_quote_id is not null then 'delivery' else 'pickup' end,
    case when v_quote_id is not null then 'delivery' else 'pickup' end,
    case when v_quote_id is not null then q.address else null end,
    v_delivery_fee,
    case when v_quote_id is not null then 'pending' else null end,
    case when v_quote_id is not null then q.lat else null end,
    case when v_quote_id is not null then q.lng else null end,
    case when v_quote_id is not null then q.distance_km else null end,
    v_subtotal, v_disc_total, v_total, 'novo', 'pago', 'approved',
    'pdv', 'pdv', 'pdv',
    'Venda PDV #' || v_sale_number || case when v_quote_id is not null then ' · Entrega: ' || q.address else '' end,
    s.store_id
  )
  returning id into v_order_id;

  insert into public.order_items(order_id, product_id, product_name, unit_price, quantity, total, product_image_url, trier_product_id)
  select v_order_id, i.product_id, i.product_name, i.unit_price, i.quantity, i.total, i.image_url, i.trier_product_id
    from public.pos_sale_items i where i.sale_id = v_sale_id;

  update public.pos_sales set subtotal=v_subtotal, discount=v_disc_total, total=v_total,
                              change_amount=v_change, order_id=v_order_id, status='completed',
                              trier_status='pending'
   where id=v_sale_id;

  if v_quote_id is not null then
    update public.pos_delivery_quotes
       set consumed_at = now(), consumed_by_sale_id = v_sale_id
     where id = v_quote_id;
  end if;

  if v_cash_due > 0 then
    insert into public.cash_movements(tenant_id, store_id, terminal_id, session_id, operator_id, type, amount, payment_method, sale_id)
    values (s.tenant_id, s.store_id, s.terminal_id, s.id, uid, 'sale', v_cash_due, 'cash', v_sale_id);
  end if;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'order_id', v_order_id,
    'subtotal', v_subtotal,
    'discount', v_disc_total,
    'delivery_fee', v_delivery_fee,
    'delivery_address', case when v_quote_id is not null then q.address else null end,
    'delivery_distance_km', case when v_quote_id is not null then q.distance_km else null end,
    'total', v_total,
    'change', v_change
  );
end; $$;

revoke all on function public.pos_finalize_sale(jsonb) from public, anon;
grant execute on function public.pos_finalize_sale(jsonb) to authenticated, service_role;
