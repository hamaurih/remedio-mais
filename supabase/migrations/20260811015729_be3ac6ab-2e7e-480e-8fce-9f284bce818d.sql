CREATE OR REPLACE FUNCTION public.pos_finalize_sale(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  s record; v_role public.pos_role; v_max numeric;
  v_session uuid := (_payload->>'session_id')::uuid;
  v_req text := NULLIF(_payload->>'client_request_id','');
  v_sale_id uuid; v_sale_number bigint;
  it jsonb; pay jsonb; p record;
  v_qty int; v_unit numeric; v_base numeric; v_item_disc numeric; v_item_total numeric;
  v_subtotal numeric := 0; v_disc_total numeric := 0; v_total numeric := 0;
  v_paid numeric := 0; v_received_cash numeric := 0; v_cash_due numeric := 0; v_change numeric := 0;
  v_promo boolean; v_order_id uuid; existing record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_req IS NOT NULL THEN
    SELECT id, sale_number INTO existing FROM public.pos_sales WHERE client_request_id = v_req;
    IF existing.id IS NOT NULL THEN
      RETURN jsonb_build_object('sale_id', existing.id, 'sale_number', existing.sale_number, 'duplicate', true);
    END IF;
  END IF;

  SELECT * INTO s FROM public.cash_register_sessions WHERE id=v_session;
  IF s IS NULL OR s.status <> 'open' THEN RAISE EXCEPTION 'Nenhum caixa aberto para esta venda'; END IF;
  IF NOT public.pos_is_operator(uid, s.store_id) THEN RAISE EXCEPTION 'Sem permissão no PDV'; END IF;
  v_role := public.pos_effective_role(uid, s.store_id);
  v_max := public.pos_max_discount(uid, s.store_id);

  IF jsonb_array_length(COALESCE(_payload->'items','[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Venda sem itens'; END IF;

  INSERT INTO public.pos_sales(tenant_id, store_id, terminal_id, session_id, operator_id, status,
                               customer_id, customer_name, customer_cpf, customer_phone, notes, client_request_id,
                               discount_authorized_by)
  VALUES (s.tenant_id, s.store_id, s.terminal_id, s.id, uid, 'paid',
          NULLIF(_payload->>'customer_id','')::uuid, NULLIF(_payload->>'customer_name',''),
          NULLIF(_payload->>'customer_cpf',''), NULLIF(_payload->>'customer_phone',''),
          NULLIF(_payload->>'notes',''), v_req,
          CASE WHEN COALESCE((_payload->>'discount')::numeric,0) > 0 THEN uid END)
  RETURNING id, sale_number INTO v_sale_id, v_sale_number;

  FOR it IN SELECT * FROM jsonb_array_elements(_payload->'items') LOOP
    SELECT * INTO p FROM public.products WHERE id = (it->>'product_id')::uuid FOR UPDATE;
    IF p IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
    v_qty := GREATEST(COALESCE((it->>'quantity')::int,1),1);
    IF COALESCE(p.stock,0) < v_qty THEN
      RAISE EXCEPTION 'Estoque insuficiente para %: disponível %', p.name, COALESCE(p.stock,0);
    END IF;

    v_base := COALESCE(p.price,0);
    v_promo := p.promo_price IS NOT NULL AND p.promo_price > 0 AND p.promo_price < COALESCE(p.price, p.promo_price+1)
               AND (p.promotion_start IS NULL OR p.promotion_start <= now())
               AND (p.promotion_end IS NULL OR p.promotion_end >= now());
    v_unit := CASE WHEN v_promo THEN p.promo_price ELSE v_base END;
    IF v_unit <= 0 THEN RAISE EXCEPTION 'Produto % sem preço válido', p.name; END IF;

    v_item_disc := GREATEST(COALESCE((it->>'discount')::numeric,0),0);
    IF v_item_disc > 0 AND (v_item_disc / (v_unit * v_qty)) * 100 > v_max + 0.001 THEN
      RAISE EXCEPTION 'Desconto acima do limite do seu perfil (% %%)', v_max;
    END IF;
    v_item_total := ROUND(v_unit * v_qty - v_item_disc, 2);
    IF v_item_total < 0 THEN RAISE EXCEPTION 'Desconto maior que o valor do item'; END IF;

    INSERT INTO public.pos_sale_items(sale_id, product_id, product_name, trier_product_id, barcode, sku, image_url,
                                      quantity, base_price, unit_price, discount, total, promo_applied)
    VALUES (v_sale_id, p.id, p.name, p.trier_product_id::text, COALESCE(p.barcode, p.trier_barcode, p.manual_barcode),
            p.sku, p.image_url, v_qty, v_base, v_unit, v_item_disc, v_item_total, v_promo);

    UPDATE public.products SET stock = COALESCE(stock,0) - v_qty WHERE id = p.id;
    INSERT INTO public.stock_movements(product_id, type, quantity, reason, source, created_by, metadata)
    VALUES (p.id, 'saida', v_qty, 'Venda PDV #' || v_sale_number, 'pdv', uid,
            jsonb_build_object('pos_sale_id', v_sale_id, 'session_id', s.id));

    v_subtotal := v_subtotal + ROUND(v_unit * v_qty, 2);
    v_disc_total := v_disc_total + v_item_disc;
  END LOOP;

  v_disc_total := v_disc_total + GREATEST(COALESCE((_payload->>'discount')::numeric,0),0);
  IF v_subtotal > 0 AND (v_disc_total / v_subtotal) * 100 > v_max + 0.001 THEN
    RAISE EXCEPTION 'Desconto total acima do limite do seu perfil (% %%)', v_max;
  END IF;
  v_total := ROUND(v_subtotal - v_disc_total, 2);
  IF v_total < 0 THEN RAISE EXCEPTION 'Desconto maior que o total da venda'; END IF;

  FOR pay IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'payments','[]'::jsonb)) LOOP
    INSERT INTO public.pos_sale_payments(sale_id, method, amount, received_amount, installments)
    VALUES (v_sale_id, (pay->>'method')::public.pos_payment_method,
            ROUND((pay->>'amount')::numeric,2), NULLIF(pay->>'received_amount','')::numeric,
            NULLIF(pay->>'installments','')::int);
    v_paid := v_paid + ROUND((pay->>'amount')::numeric,2);
    IF (pay->>'method') = 'cash' THEN
      v_cash_due := v_cash_due + ROUND((pay->>'amount')::numeric,2);
      v_received_cash := v_received_cash + COALESCE(NULLIF(pay->>'received_amount','')::numeric, ROUND((pay->>'amount')::numeric,2));
    END IF;
  END LOOP;

  IF ROUND(v_paid,2) <> v_total THEN
    RAISE EXCEPTION 'Soma dos pagamentos (%) diferente do total da venda (%)', v_paid, v_total;
  END IF;
  v_change := GREATEST(ROUND(v_received_cash - v_cash_due, 2), 0);

  INSERT INTO public.orders(customer_name, customer_phone, customer_cpf, delivery_method, delivery_type,
                            subtotal, discount, delivery_fee, total, status, order_status, payment_status,
                            payment_method, payment_gateway, sales_channel, notes)
  VALUES (COALESCE(NULLIF(_payload->>'customer_name',''),'Consumidor não identificado'),
          COALESCE(NULLIF(_payload->>'customer_phone',''),'0000000000'),
          NULLIF(_payload->>'customer_cpf',''), 'pickup', 'pickup',
          v_subtotal, v_disc_total, 0, v_total, 'novo', 'pago', 'approved',
          'pdv', 'pdv', 'pdv', 'Venda PDV #' || v_sale_number)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items(order_id, product_id, product_name, unit_price, quantity, total, product_image_url, trier_product_id)
  SELECT v_order_id, i.product_id, i.product_name, i.unit_price, i.quantity, i.total, i.image_url, i.trier_product_id
    FROM public.pos_sale_items i WHERE i.sale_id = v_sale_id;

  UPDATE public.pos_sales SET subtotal=v_subtotal, discount=v_disc_total, total=v_total,
                              change_amount=v_change, order_id=v_order_id, status='completed',
                              trier_status='pending'
   WHERE id=v_sale_id;

  IF v_cash_due > 0 THEN
    INSERT INTO public.cash_movements(tenant_id, store_id, terminal_id, session_id, operator_id, type, amount, payment_method, sale_id)
    VALUES (s.tenant_id, s.store_id, s.terminal_id, s.id, uid, 'sale', v_cash_due, 'cash', v_sale_id);
  END IF;

  RETURN jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_sale_number, 'order_id', v_order_id,
                            'subtotal', v_subtotal, 'discount', v_disc_total, 'total', v_total, 'change', v_change);
END; $$;

REVOKE ALL ON FUNCTION public.pos_finalize_sale(jsonb) FROM anon;