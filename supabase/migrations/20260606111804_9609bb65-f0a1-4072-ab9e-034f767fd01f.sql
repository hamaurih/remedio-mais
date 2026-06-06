
-- Fase 1: status detalhados (fulfillment + delivery) — order_status, payment_status, paid_at, cancelled_at já existem
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'unfulfilled',
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending';

-- Constraints de domínio (não-destrutivas; rejeitam valores futuros inválidos)
DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_order_status_check
    CHECK (order_status IN ('carrinho','aguardando_pagamento','pago','em_separacao','pronto_para_retirada','saiu_para_entrega','entregue','cancelado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('pending','approved','rejected','cancelled','refunded','chargeback'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_status_check
    CHECK (fulfillment_status IN ('unfulfilled','picking','packed','shipped','delivered','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_status_check
    CHECK (delivery_status IN ('pending','preparing','out_for_delivery','delivered','pickup_ready','picked_up','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill a partir do status legado (orders.status text)
UPDATE public.orders SET
  order_status = CASE status
    WHEN 'novo' THEN 'aguardando_pagamento'
    WHEN 'em_atendimento' THEN 'aguardando_pagamento'
    WHEN 'aguardando_pagamento' THEN 'aguardando_pagamento'
    WHEN 'separando' THEN 'em_separacao'
    WHEN 'saiu_para_entrega' THEN 'saiu_para_entrega'
    WHEN 'retirado' THEN 'entregue'
    WHEN 'finalizado' THEN 'entregue'
    WHEN 'cancelado' THEN 'cancelado'
    ELSE order_status
  END,
  fulfillment_status = CASE status
    WHEN 'separando' THEN 'picking'
    WHEN 'saiu_para_entrega' THEN 'shipped'
    WHEN 'retirado' THEN 'delivered'
    WHEN 'finalizado' THEN 'delivered'
    WHEN 'cancelado' THEN 'cancelled'
    ELSE fulfillment_status
  END,
  delivery_status = CASE
    WHEN status IN ('retirado','finalizado') THEN 'delivered'
    WHEN status = 'saiu_para_entrega' THEN 'out_for_delivery'
    WHEN status = 'cancelado' THEN 'cancelled'
    ELSE delivery_status
  END
WHERE TRUE;

-- Fase 2: histórico de eventos do pedido
CREATE TABLE IF NOT EXISTS public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  type text NOT NULL,
  old_status text,
  new_status text,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_events_order_id_idx ON public.order_events(order_id, created_at DESC);

GRANT SELECT, INSERT ON public.order_events TO authenticated;
GRANT ALL ON public.order_events TO service_role;

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage order_events" ON public.order_events;
CREATE POLICY "Admins manage order_events" ON public.order_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Customers read own order_events" ON public.order_events;
CREATE POLICY "Customers read own order_events" ON public.order_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_events.order_id AND o.user_id = auth.uid()));

-- Trigger: registra mudanças relevantes
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_events(order_id, type, new_status, message, created_by)
    VALUES (NEW.id, 'created', NEW.order_status, 'Pedido criado', uid);
    RETURN NEW;
  END IF;

  IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
    INSERT INTO public.order_events(order_id, type, old_status, new_status, created_by)
    VALUES (NEW.id, 'order_status', OLD.order_status, NEW.order_status, uid);
  END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    INSERT INTO public.order_events(order_id, type, old_status, new_status, created_by)
    VALUES (NEW.id, 'payment_status', OLD.payment_status, NEW.payment_status, uid);
    IF NEW.payment_status = 'approved' AND NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
  END IF;
  IF NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status THEN
    INSERT INTO public.order_events(order_id, type, old_status, new_status, created_by)
    VALUES (NEW.id, 'fulfillment_status', OLD.fulfillment_status, NEW.fulfillment_status, uid);
  END IF;
  IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status THEN
    INSERT INTO public.order_events(order_id, type, old_status, new_status, created_by)
    VALUES (NEW.id, 'delivery_status', OLD.delivery_status, NEW.delivery_status, uid);
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'cancelado' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_log_status ON public.orders;
CREATE TRIGGER trg_orders_log_status
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();
