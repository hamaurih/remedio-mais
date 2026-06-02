
-- ============ orders ============
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_cpf text,
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_type text NOT NULL DEFAULT 'pickup',
  ADD COLUMN IF NOT EXISTS delivery_cep text,
  ADD COLUMN IF NOT EXISTS delivery_street text,
  ADD COLUMN IF NOT EXISTS delivery_number text,
  ADD COLUMN IF NOT EXISTS delivery_complement text,
  ADD COLUMN IF NOT EXISTS delivery_neighborhood text,
  ADD COLUMN IF NOT EXISTS delivery_city text,
  ADD COLUMN IF NOT EXISTS delivery_state text,
  ADD COLUMN IF NOT EXISTS delivery_reference text,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_gateway text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS order_status text NOT NULL DEFAULT 'aguardando_pagamento',
  ADD COLUMN IF NOT EXISTS mercado_pago_preference_id text,
  ADD COLUMN IF NOT EXISTS mercado_pago_payment_id text,
  ADD COLUMN IF NOT EXISTS mercado_pago_order_id text,
  ADD COLUMN IF NOT EXISTS mercado_pago_checkout_url text,
  ADD COLUMN IF NOT EXISTS external_reference text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_external_reference ON public.orders(external_reference);

-- Permitir que cliente logado leia seus próprios pedidos
DROP POLICY IF EXISTS orders_owner_read ON public.orders;
CREATE POLICY orders_owner_read ON public.orders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Substituir policy de insert público pelo insert autenticado controlado
DROP POLICY IF EXISTS orders_public_insert ON public.orders;
CREATE POLICY orders_authenticated_insert ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND payment_status = 'pending'
    AND order_status = 'aguardando_pagamento'
    AND trier_sent = false
    AND char_length(customer_name) BETWEEN 2 AND 120
    AND char_length(customer_phone) BETWEEN 8 AND 20
    AND total >= 0 AND total <= 100000
    AND delivery_type IN ('pickup','delivery')
    AND (payment_method IS NULL OR payment_method IN ('pix','credit_card'))
  );

-- Permitir que o dono atualize apenas se ainda estiver pendente (para retry de checkout)
DROP POLICY IF EXISTS orders_owner_update_pending ON public.orders;
CREATE POLICY orders_owner_update_pending ON public.orders
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND payment_status = 'pending')
  WITH CHECK (auth.uid() = user_id);

-- ============ order_items ============
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_image_url text,
  ADD COLUMN IF NOT EXISTS total numeric,
  ADD COLUMN IF NOT EXISTS requires_prescription boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS controlled boolean NOT NULL DEFAULT false;

-- Permitir cliente logado ver itens do próprio pedido
DROP POLICY IF EXISTS order_items_owner_read ON public.order_items;
CREATE POLICY order_items_owner_read ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid()));

-- Substituir insert público pelo insert autenticado vinculado ao próprio pedido
DROP POLICY IF EXISTS order_items_public_insert ON public.order_items;
CREATE POLICY order_items_owner_insert ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
        AND o.payment_status = 'pending'
    )
    AND quantity > 0 AND quantity <= 1000
    AND unit_price >= 0 AND unit_price <= 100000
    AND char_length(product_name) BETWEEN 1 AND 250
  );

-- ============ payment_events ============
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  gateway text NOT NULL DEFAULT 'mercado_pago',
  event_type text,
  external_id text NOT NULL,
  payload jsonb,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, external_id)
);

GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_events_admin_read ON public.payment_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ admin_notifications ============
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  message text,
  order_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_read ON public.admin_notifications(read, created_at DESC);

GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_notif_admin_all ON public.admin_notifications
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ payment_settings ============
CREATE TABLE IF NOT EXISTS public.payment_settings (
  id integer PRIMARY KEY DEFAULT 1,
  gateway text NOT NULL DEFAULT 'mercado_pago',
  environment text NOT NULL DEFAULT 'sandbox',
  pix_enabled boolean NOT NULL DEFAULT true,
  credit_card_enabled boolean NOT NULL DEFAULT true,
  boleto_enabled boolean NOT NULL DEFAULT false,
  modo_integracao text NOT NULL DEFAULT 'checkout_redirect',
  last_connection_test_at timestamptz,
  last_connection_status text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_settings_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.payment_settings TO authenticated;
GRANT ALL ON public.payment_settings TO service_role;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_settings_admin_all ON public.payment_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.payment_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============ prescriptions ============
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_prescriptions_user_product
  ON public.prescriptions(user_id, product_id, status);

-- Cliente logado pode ver suas próprias receitas
DROP POLICY IF EXISTS prescriptions_owner_read ON public.prescriptions;
CREATE POLICY prescriptions_owner_read ON public.prescriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============ profiles ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS email text;
