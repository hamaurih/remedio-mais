-- Preços independentes por canal + ordenação operacional A-Z.
-- Site: products.site_price / site_promo_price
-- IA/WhatsApp: products.whatsapp_price / whatsapp_promo_price
-- Balcão/PDV: products.pdv_price / pdv_promo_price

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pdv_price numeric,
  ADD COLUMN IF NOT EXISTS pdv_promo_price numeric,
  ADD COLUMN IF NOT EXISTS pdv_discount_percentage numeric;

COMMENT ON COLUMN public.products.pdv_price IS 'Preço específico do balcão/PDV. Nulo = usa preço normal.';
COMMENT ON COLUMN public.products.pdv_promo_price IS 'Preço promocional específico do balcão/PDV. Nulo = usa promoção geral.';
COMMENT ON COLUMN public.products.pdv_discount_percentage IS 'Percentual de desconto do balcão/PDV usado quando lock_channel_discount está ativo.';

WITH latest_spp AS (
  SELECT DISTINCT ON (product_id)
    product_id, pdv_price, promo_price
  FROM public.store_product_prices
  ORDER BY product_id, updated_at DESC NULLS LAST
)
UPDATE public.products p
SET
  pdv_price = COALESCE(p.pdv_price, s.pdv_price),
  pdv_promo_price = COALESCE(p.pdv_promo_price, s.promo_price)
FROM latest_spp s
WHERE s.product_id = p.id
  AND (p.pdv_price IS NULL OR p.pdv_promo_price IS NULL);

UPDATE public.products
SET pdv_discount_percentage =
  ROUND((1 - (pdv_price / NULLIF(COALESCE(price_base, price), 0))) * 100, 2)
WHERE pdv_discount_percentage IS NULL
  AND pdv_price IS NOT NULL AND pdv_price > 0
  AND COALESCE(price_base, price) > 0
  AND pdv_price < COALESCE(price_base, price);

CREATE OR REPLACE FUNCTION public.admin_products_list(_search text DEFAULT NULL::text, _category_id uuid DEFAULT NULL::uuid, _manufacturer text DEFAULT NULL::text, _status text DEFAULT 'all'::text, _page integer DEFAULT 1, _page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_page integer := greatest(coalesce(_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(_page_size, 50), 1), 200);
  v_offset integer;
  v_result jsonb;
  v_search text := nullif(btrim(_search), '');
  v_code text := regexp_replace(coalesce(_search, ''), '\s+', '', 'g');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode consultar produtos completos';
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  WITH filtered AS (
    SELECT p.*, c.name AS category_display_name
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE (
      v_search IS NULL
      OR p.name ILIKE ('%' || v_search || '%')
      OR p.barcode = v_code
      OR p.trier_barcode = v_code
      OR p.sku ILIKE ('%' || v_search || '%')
      OR p.trier_product_id = v_code
      OR p.manufacturer ILIKE ('%' || v_search || '%')
      OR p.active_ingredient ILIKE ('%' || v_search || '%')
      OR p.laboratory ILIKE ('%' || v_search || '%')
      OR p.category_name ILIKE ('%' || v_search || '%')
    )
      AND (_category_id IS NULL OR p.category_id = _category_id)
      AND (_manufacturer IS NULL OR _manufacturer = '' OR p.manufacturer = _manufacturer)
      AND (
        coalesce(_status, 'all') = 'all'
        OR (coalesce(_status, 'all') = 'active' AND p.active = true)
        OR (coalesce(_status, 'all') = 'inactive' AND p.active = false)
        OR (coalesce(_status, 'all') = 'sale' AND p.promo_price IS NOT NULL)
        OR (coalesce(_status, 'all') = 'low' AND p.stock <= coalesce(p.minimum_stock, 5))
        OR (coalesce(_status, 'all') = 'negative_stock' AND coalesce(p.stock, 0) < 0)
        OR (coalesce(_status, 'all') = 'stock_inactive' AND p.active = false AND p.stock > 0)
        OR (coalesce(_status, 'all') = 'no_barcode_stock' AND (p.barcode IS NULL OR p.barcode = '') AND p.stock > 0)
        OR (coalesce(_status, 'all') = 'no_image_stock' AND (p.image_url IS NULL OR p.image_url = '' OR p.image_url ILIKE '%placeholder%') AND p.stock > 0)
      )
  ), counted AS (
    SELECT count(*)::integer AS total_count FROM filtered
  ), paged AS (
    SELECT *
    FROM filtered
    ORDER BY name ASC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT v_page_size OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT total_count FROM counted),
    'page', v_page,
    'page_size', v_page_size,
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(paged.*)) FROM paged), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_finalize_sale(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    v_base := coalesce(p.pdv_price, p.price, 0);
    v_promo := coalesce(p.pdv_promo_price, p.promo_price) is not null and coalesce(p.pdv_promo_price, p.promo_price) > 0 and coalesce(p.pdv_promo_price, p.promo_price) < v_base
               and (p.promotion_start is null or p.promotion_start <= now())
               and (p.promotion_end is null or p.promotion_end >= now());
    v_unit := case when v_promo then coalesce(p.pdv_promo_price, p.promo_price) else v_base end;
    if v_unit <= 0 then raise exception 'Produto % sem preço válido', p.name; end if;

    v_item_disc := greatest(coalesce((it->>'discount')::numeric,0),0);
    if v_item_disc > 0 and (v_item_disc / (v_unit * v_qty)) * 100 > v_max + 0.001 then
      raise exception 'Desconto acima do limite do seu perfil (% %%)', v_max;
    end if;
    v_item_total := round(v_unit * v_qty - v_item_disc, 2);
    if v_item_total < 0 then raise exception 'Desconto maior que o valor do item'; end if;

    insert into public.pos_sale_items(sale_id, product_id, product_name, trier_product_id, barcode, sku, image_url,
                                      quantity, base_price, unit_price, discount, total, promo_applied)
    values (v_sale_id, p.id, p.name, p.trier_product_id::text, coalesce(p.barcode, p.trier_barcode),
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
end; $function$
;
