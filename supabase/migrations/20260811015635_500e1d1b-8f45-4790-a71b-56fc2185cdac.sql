-- ============ ENUMS ============
CREATE TYPE public.pos_role AS ENUM ('operator','supervisor','manager','admin');
CREATE TYPE public.pos_sale_status AS ENUM ('draft','awaiting_payment','paid','completed','cancelled','refunded','trier_pending','trier_sent','trier_error');
CREATE TYPE public.pos_payment_method AS ENUM ('cash','pix','debit','credit');
CREATE TYPE public.pos_movement_type AS ENUM ('opening','sale','withdrawal','deposit','refund','cancellation','closing');
CREATE TYPE public.pos_session_status AS ENUM ('open','closed');

-- ============ TENANTS / STORES / TERMINALS ============
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  cnpj text,
  legal_name text,
  address text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pos_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pos_terminals TO authenticated;
GRANT ALL ON public.pos_terminals TO service_role;
ALTER TABLE public.pos_terminals ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pos_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  pos_role public.pos_role NOT NULL DEFAULT 'operator',
  max_discount_percent numeric(6,3) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id)
);
GRANT SELECT ON public.pos_operators TO authenticated;
GRANT ALL ON public.pos_operators TO service_role;
ALTER TABLE public.pos_operators ENABLE ROW LEVEL SECURITY;

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.pos_is_operator(_user_id uuid, _store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'admin')
      OR EXISTS (SELECT 1 FROM public.pos_operators o
                  WHERE o.user_id=_user_id AND o.active
                    AND (_store_id IS NULL OR o.store_id=_store_id));
$$;

CREATE OR REPLACE FUNCTION public.pos_effective_role(_user_id uuid, _store_id uuid)
RETURNS public.pos_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.has_role(_user_id,'admin') THEN 'admin'::public.pos_role
              ELSE (SELECT o.pos_role FROM public.pos_operators o
                     WHERE o.user_id=_user_id AND o.active AND o.store_id=_store_id LIMIT 1) END;
$$;

CREATE OR REPLACE FUNCTION public.pos_max_discount(_user_id uuid, _store_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.has_role(_user_id,'admin') THEN 100
              ELSE COALESCE((SELECT o.max_discount_percent FROM public.pos_operators o
                              WHERE o.user_id=_user_id AND o.active AND o.store_id=_store_id LIMIT 1),0) END;
$$;

CREATE POLICY "tenants readable by pos users" ON public.tenants FOR SELECT TO authenticated USING (public.pos_is_operator(auth.uid(), NULL));
CREATE POLICY "tenants admin manage" ON public.tenants FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "stores readable by pos users" ON public.stores FOR SELECT TO authenticated USING (public.pos_is_operator(auth.uid(), NULL));
CREATE POLICY "stores admin manage" ON public.stores FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "terminals readable by pos users" ON public.pos_terminals FOR SELECT TO authenticated USING (public.pos_is_operator(auth.uid(), store_id));
CREATE POLICY "terminals admin manage" ON public.pos_terminals FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "operators see own record" ON public.pos_operators FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "operators admin manage" ON public.pos_operators FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ CAIXA ============
CREATE TABLE public.cash_register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  terminal_id uuid NOT NULL REFERENCES public.pos_terminals(id) ON DELETE RESTRICT,
  operator_id uuid NOT NULL,
  status public.pos_session_status NOT NULL DEFAULT 'open',
  opening_amount numeric(12,2) NOT NULL DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid,
  expected_cash numeric(12,2),
  counted_cash numeric(12,2),
  difference numeric(12,2),
  totals jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cash_sessions_one_open_per_terminal ON public.cash_register_sessions(terminal_id) WHERE status='open';
GRANT SELECT ON public.cash_register_sessions TO authenticated;
GRANT ALL ON public.cash_register_sessions TO service_role;
ALTER TABLE public.cash_register_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions readable by store operators" ON public.cash_register_sessions FOR SELECT TO authenticated USING (public.pos_is_operator(auth.uid(), store_id));

CREATE TABLE public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  terminal_id uuid NOT NULL REFERENCES public.pos_terminals(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES public.cash_register_sessions(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL,
  type public.pos_movement_type NOT NULL,
  amount numeric(12,2) NOT NULL,
  payment_method public.pos_payment_method,
  sale_id uuid,
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cash_movements_session_idx ON public.cash_movements(session_id);
GRANT SELECT ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movements readable by store operators" ON public.cash_movements FOR SELECT TO authenticated USING (public.pos_is_operator(auth.uid(), store_id));

-- ============ VENDAS ============
CREATE SEQUENCE public.pos_sale_number_seq;
CREATE TABLE public.pos_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number bigint NOT NULL DEFAULT nextval('public.pos_sale_number_seq'),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  terminal_id uuid NOT NULL REFERENCES public.pos_terminals(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES public.cash_register_sessions(id) ON DELETE RESTRICT,
  operator_id uuid NOT NULL,
  status public.pos_sale_status NOT NULL DEFAULT 'completed',
  customer_id uuid,
  customer_name text,
  customer_cpf text,
  customer_phone text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  discount_authorized_by uuid,
  total numeric(12,2) NOT NULL DEFAULT 0,
  change_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  trier_status text NOT NULL DEFAULT 'pending',
  trier_error_message text,
  trier_sent_at timestamptz,
  client_request_id text UNIQUE,
  cancelled_at timestamptz,
  cancelled_by uuid,
  -- reservado para o módulo fiscal futuro (NFC-e / NF-e)
  fiscal_model text,
  fiscal_number text,
  fiscal_series text,
  fiscal_access_key text,
  fiscal_protocol text,
  fiscal_status text,
  fiscal_xml text,
  fiscal_issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pos_sales_session_idx ON public.pos_sales(session_id);
CREATE INDEX pos_sales_created_idx ON public.pos_sales(created_at DESC);
GRANT SELECT ON public.pos_sales TO authenticated;
GRANT ALL ON public.pos_sales TO service_role;
ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales readable by store operators" ON public.pos_sales FOR SELECT TO authenticated USING (public.pos_is_operator(auth.uid(), store_id));

CREATE TABLE public.pos_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  trier_product_id text,
  barcode text,
  sku text,
  image_url text,
  quantity integer NOT NULL CHECK (quantity > 0),
  base_price numeric(12,2) NOT NULL DEFAULT 0,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  promo_applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pos_sale_items_sale_idx ON public.pos_sale_items(sale_id);
GRANT SELECT ON public.pos_sale_items TO authenticated;
GRANT ALL ON public.pos_sale_items TO service_role;
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale items readable by store operators" ON public.pos_sale_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.pos_sales s WHERE s.id = sale_id AND public.pos_is_operator(auth.uid(), s.store_id)));

CREATE TABLE public.pos_sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  method public.pos_payment_method NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  received_amount numeric(12,2),
  installments integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pos_sale_payments_sale_idx ON public.pos_sale_payments(sale_id);
GRANT SELECT ON public.pos_sale_payments TO authenticated;
GRANT ALL ON public.pos_sale_payments TO service_role;
ALTER TABLE public.pos_sale_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale payments readable by store operators" ON public.pos_sale_payments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.pos_sales s WHERE s.id = sale_id AND public.pos_is_operator(auth.uid(), s.store_id)));

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_stores_updated BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_pos_terminals_updated BEFORE UPDATE ON public.pos_terminals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_pos_operators_updated BEFORE UPDATE ON public.pos_operators FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_cash_sessions_updated BEFORE UPDATE ON public.cash_register_sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_pos_sales_updated BEFORE UPDATE ON public.pos_sales FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ SEED: primeiro tenant / loja / terminal ============
INSERT INTO public.tenants(name, slug) VALUES ('Atacadão dos Medicamentos','atacadao-dos-medicamentos');
INSERT INTO public.stores(tenant_id, name, code, cnpj, legal_name, address)
SELECT t.id, COALESCE(s.store_name,'Loja Matriz'), 'MATRIZ', s.cnpj, s.legal_name, s.address
  FROM public.tenants t LEFT JOIN public.store_settings s ON s.id = 1
 WHERE t.slug='atacadao-dos-medicamentos';
INSERT INTO public.pos_terminals(store_id, name, code)
SELECT st.id, 'Caixa 1', 'CX1' FROM public.stores st WHERE st.code='MATRIZ';

-- ============ OPERAÇÕES SERVER-SIDE ============
CREATE OR REPLACE FUNCTION public.pos_open_session(_terminal_id uuid, _opening_amount numeric DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_store uuid; v_tenant uuid; v_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT t.store_id, s.tenant_id INTO v_store, v_tenant
    FROM public.pos_terminals t JOIN public.stores s ON s.id=t.store_id WHERE t.id=_terminal_id AND t.active;
  IF v_store IS NULL THEN RAISE EXCEPTION 'Terminal inválido'; END IF;
  IF NOT public.pos_is_operator(uid, v_store) THEN RAISE EXCEPTION 'Sem permissão no PDV desta loja'; END IF;
  IF EXISTS (SELECT 1 FROM public.cash_register_sessions WHERE terminal_id=_terminal_id AND status='open') THEN
    RAISE EXCEPTION 'Já existe caixa aberto neste terminal';
  END IF;
  INSERT INTO public.cash_register_sessions(tenant_id, store_id, terminal_id, operator_id, opening_amount)
  VALUES (v_tenant, v_store, _terminal_id, uid, COALESCE(_opening_amount,0)) RETURNING id INTO v_id;
  INSERT INTO public.cash_movements(tenant_id, store_id, terminal_id, session_id, operator_id, type, amount, payment_method)
  VALUES (v_tenant, v_store, _terminal_id, v_id, uid, 'opening', COALESCE(_opening_amount,0), 'cash');
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.pos_cash_movement(_session_id uuid, _type public.pos_movement_type, _amount numeric, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); s record; v_role public.pos_role; v_id uuid;
BEGIN
  SELECT * INTO s FROM public.cash_register_sessions WHERE id=_session_id;
  IF s IS NULL THEN RAISE EXCEPTION 'Sessão não encontrada'; END IF;
  IF s.status <> 'open' THEN RAISE EXCEPTION 'Caixa já fechado'; END IF;
  IF NOT public.pos_is_operator(uid, s.store_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  v_role := public.pos_effective_role(uid, s.store_id);
  IF _type NOT IN ('withdrawal','deposit') THEN RAISE EXCEPTION 'Tipo não permitido aqui'; END IF;
  IF _type='withdrawal' AND v_role NOT IN ('manager','admin') THEN RAISE EXCEPTION 'Somente gerente ou admin pode fazer sangria'; END IF;
  IF COALESCE(_amount,0) <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  INSERT INTO public.cash_movements(tenant_id, store_id, terminal_id, session_id, operator_id, type, amount, payment_method, reason)
  VALUES (s.tenant_id, s.store_id, s.terminal_id, s.id, uid, _type, _amount, 'cash', _reason) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.pos_close_session(_session_id uuid, _counted_cash numeric, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); s record; v_role public.pos_role; v_cash numeric; v_expected numeric; v_totals jsonb;
BEGIN
  SELECT * INTO s FROM public.cash_register_sessions WHERE id=_session_id;
  IF s IS NULL THEN RAISE EXCEPTION 'Sessão não encontrada'; END IF;
  IF s.status <> 'open' THEN RAISE EXCEPTION 'Caixa já fechado'; END IF;
  IF NOT public.pos_is_operator(uid, s.store_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  v_role := public.pos_effective_role(uid, s.store_id);
  IF s.operator_id <> uid AND v_role NOT IN ('manager','admin') THEN
    RAISE EXCEPTION 'Somente o próprio operador, gerente ou admin pode fechar este caixa';
  END IF;

  SELECT COALESCE(jsonb_object_agg(method, amt),'{}'::jsonb) INTO v_totals FROM (
    SELECT p.method::text AS method, SUM(p.amount) AS amt
      FROM public.pos_sale_payments p JOIN public.pos_sales sa ON sa.id=p.sale_id
     WHERE sa.session_id=_session_id AND sa.status <> 'cancelled'
     GROUP BY p.method) q;

  SELECT COALESCE(SUM(CASE WHEN type IN ('opening','deposit') THEN amount
                           WHEN type IN ('withdrawal','refund') THEN -amount ELSE 0 END),0)
    INTO v_cash FROM public.cash_movements WHERE session_id=_session_id;
  v_expected := v_cash + COALESCE((v_totals->>'cash')::numeric,0)
                       - COALESCE((SELECT SUM(change_amount) FROM public.pos_sales WHERE session_id=_session_id AND status<>'cancelled'),0);

  UPDATE public.cash_register_sessions
     SET status='closed', closed_at=now(), closed_by=uid, counted_cash=_counted_cash,
         expected_cash=v_expected, difference=COALESCE(_counted_cash,0)-v_expected, totals=v_totals, notes=_notes
   WHERE id=_session_id;

  INSERT INTO public.cash_movements(tenant_id, store_id, terminal_id, session_id, operator_id, type, amount, payment_method, metadata)
  VALUES (s.tenant_id, s.store_id, s.terminal_id, s.id, uid, 'closing', COALESCE(_counted_cash,0), 'cash',
          jsonb_build_object('expected', v_expected, 'totals', v_totals));

  RETURN jsonb_build_object('expected_cash', v_expected, 'counted_cash', _counted_cash,
                            'difference', COALESCE(_counted_cash,0)-v_expected, 'totals', v_totals);
END; $$;

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

  -- Pedido espelho no canal PDV: reaproveita o envio ao Trier já existente
  INSERT INTO public.orders(customer_name, customer_phone, customer_cpf, delivery_method, delivery_type,
                            subtotal, discount, delivery_fee, total, status, order_status, payment_status,
                            payment_method, payment_gateway, sales_channel, notes)
  VALUES (COALESCE(NULLIF(_payload->>'customer_name',''),'Consumidor não identificado'),
          COALESCE(NULLIF(_payload->>'customer_phone',''),'0000000000'),
          NULLIF(_payload->>'customer_cpf',''), 'pickup', 'pickup',
          v_subtotal, v_disc_total, 0, v_total, 'novo', 'pago', 'approved',
          'pdv', 'pdv', 'pdv', 'Venda PDV #' || v_sale_number)
  RETURNING id INTO v_order_id;

  INSERT INTO public.orders_items_placeholder_noop AS x SELECT 1 WHERE false; -- no-op guard (ignored)

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
REVOKE ALL ON FUNCTION public.pos_open_session(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.pos_close_session(uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.pos_cash_movement(uuid, public.pos_movement_type, numeric, text) FROM anon;