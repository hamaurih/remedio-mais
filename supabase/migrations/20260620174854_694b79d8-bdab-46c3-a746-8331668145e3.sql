
-- ============================================================
-- FASE 1b: Tables, columns, triggers and RLS
-- ============================================================

-- order_items: item_status + observation
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS item_status text NOT NULL DEFAULT 'disponivel',
  ADD COLUMN IF NOT EXISTS item_notes text,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_by uuid;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_item_status_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_item_status_check
  CHECK (item_status IN ('disponivel','separado','indisponivel','substituir','removido'));

-- admin_notifications: expand
ALTER TABLE public.admin_notifications
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS role_target text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS target_user_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_priority_check;
ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_priority_check
  CHECK (priority IN ('low','normal','high'));

ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_role_target_check;
ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_role_target_check
  CHECK (role_target IN ('admin','seller','all'));

CREATE INDEX IF NOT EXISTS idx_admin_notifications_role_target ON public.admin_notifications(role_target, read_at);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_order ON public.admin_notifications(order_id);

-- order_events: metadata col
ALTER TABLE public.order_events
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- refund_requests
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_id text,
  requested_by uuid,
  reason text,
  type text NOT NULL DEFAULT 'partial',
  amount numeric(12,2),
  status text NOT NULL DEFAULT 'pending',
  mercado_pago_refund_id text,
  idempotency_key text UNIQUE,
  error_message text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_requests_type_check CHECK (type IN ('total','partial')),
  CONSTRAINT refund_requests_status_check CHECK (status IN ('pending','processing','approved','rejected','failed'))
);

GRANT SELECT, INSERT, UPDATE ON public.refund_requests TO authenticated;
GRANT ALL ON public.refund_requests TO service_role;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "refund_requests_admin_all" ON public.refund_requests;
CREATE POLICY "refund_requests_admin_all" ON public.refund_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "refund_requests_seller_view" ON public.refund_requests;
CREATE POLICY "refund_requests_seller_view" ON public.refund_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'seller'));

DROP POLICY IF EXISTS "refund_requests_seller_insert" ON public.refund_requests;
CREATE POLICY "refund_requests_seller_insert" ON public.refund_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'seller')
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

DROP TRIGGER IF EXISTS refund_requests_updated_at ON public.refund_requests;
CREATE TRIGGER refund_requests_updated_at
  BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- refund_items
CREATE TABLE IF NOT EXISTS public.refund_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_request_id uuid NOT NULL REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  product_id uuid,
  quantity integer NOT NULL DEFAULT 1,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refund_items TO authenticated;
GRANT ALL ON public.refund_items TO service_role;
ALTER TABLE public.refund_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "refund_items_admin_all" ON public.refund_items;
CREATE POLICY "refund_items_admin_all" ON public.refund_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "refund_items_seller_view" ON public.refund_items;
CREATE POLICY "refund_items_seller_view" ON public.refund_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'seller'));

DROP POLICY IF EXISTS "refund_items_seller_insert" ON public.refund_items;
CREATE POLICY "refund_items_seller_insert" ON public.refund_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'seller')
    AND EXISTS (
      SELECT 1 FROM public.refund_requests rr
      WHERE rr.id = refund_request_id AND rr.requested_by = auth.uid() AND rr.status = 'pending'
    )
  );

-- seller_permissions
CREATE TABLE IF NOT EXISTS public.seller_permissions (
  user_id uuid PRIMARY KEY,
  can_request_refund boolean NOT NULL DEFAULT true,
  can_execute_refund boolean NOT NULL DEFAULT false,
  can_view_prescriptions boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_permissions TO authenticated;
GRANT ALL ON public.seller_permissions TO service_role;
ALTER TABLE public.seller_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seller_permissions_admin_all" ON public.seller_permissions;
CREATE POLICY "seller_permissions_admin_all" ON public.seller_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "seller_permissions_self_view" ON public.seller_permissions;
CREATE POLICY "seller_permissions_self_view" ON public.seller_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS seller_permissions_updated_at ON public.seller_permissions;
CREATE TRIGGER seller_permissions_updated_at
  BEFORE UPDATE ON public.seller_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Orders: seller SELECT/UPDATE policies
DROP POLICY IF EXISTS "orders_seller_select" ON public.orders;
CREATE POLICY "orders_seller_select" ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'seller')
    AND COALESCE(payment_status, '') IN ('approved','refunded','partially_refunded')
  );

DROP POLICY IF EXISTS "orders_seller_update" ON public.orders;
CREATE POLICY "orders_seller_update" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'seller')
    AND COALESCE(payment_status, '') IN ('approved','refunded','partially_refunded')
  )
  WITH CHECK (public.has_role(auth.uid(), 'seller'));

-- Guard: block sellers from changing sensitive columns
CREATE OR REPLACE FUNCTION public.guard_seller_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'seller') THEN
    IF NEW.total IS DISTINCT FROM OLD.total
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.discount IS DISTINCT FROM OLD.discount
       OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.payment_gateway IS DISTINCT FROM OLD.payment_gateway
       OR NEW.mercado_pago_payment_id IS DISTINCT FROM OLD.mercado_pago_payment_id
       OR NEW.mercado_pago_preference_id IS DISTINCT FROM OLD.mercado_pago_preference_id
       OR NEW.mercado_pago_order_id IS DISTINCT FROM OLD.mercado_pago_order_id
       OR NEW.mercado_pago_checkout_url IS DISTINCT FROM OLD.mercado_pago_checkout_url
       OR NEW.external_reference IS DISTINCT FROM OLD.external_reference
       OR NEW.customer_cpf IS DISTINCT FROM OLD.customer_cpf
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.trier_sent IS DISTINCT FROM OLD.trier_sent
       OR NEW.trier_numero_nota IS DISTINCT FROM OLD.trier_numero_nota THEN
      RAISE EXCEPTION 'Vendedor não pode alterar campos financeiros/pagamento/Trier do pedido';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_seller_order_update_trg ON public.orders;
CREATE TRIGGER guard_seller_order_update_trg
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_order_update();

-- order_items: seller SELECT + UPDATE
DROP POLICY IF EXISTS "order_items_seller_select" ON public.order_items;
CREATE POLICY "order_items_seller_select" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'seller')
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND COALESCE(o.payment_status, '') IN ('approved','refunded','partially_refunded')
    )
  );

DROP POLICY IF EXISTS "order_items_seller_update" ON public.order_items;
CREATE POLICY "order_items_seller_update" ON public.order_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'seller'))
  WITH CHECK (public.has_role(auth.uid(), 'seller'));

CREATE OR REPLACE FUNCTION public.guard_seller_order_item_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'seller') THEN
    IF NEW.unit_price IS DISTINCT FROM OLD.unit_price
       OR NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.variant_id IS DISTINCT FROM OLD.variant_id
       OR NEW.order_id IS DISTINCT FROM OLD.order_id THEN
      RAISE EXCEPTION 'Vendedor só pode alterar status operacional do item';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_seller_order_item_update_trg ON public.order_items;
CREATE TRIGGER guard_seller_order_item_update_trg
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_order_item_update();

-- customer_addresses: seller SELECT
DROP POLICY IF EXISTS "customer_addresses_seller_select" ON public.customer_addresses;
CREATE POLICY "customer_addresses_seller_select" ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'seller'));

-- admin_notifications: seller policies
DROP POLICY IF EXISTS "admin_notifications_seller_select" ON public.admin_notifications;
CREATE POLICY "admin_notifications_seller_select" ON public.admin_notifications
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'seller')
    AND (role_target IN ('seller','all') OR target_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_notifications_seller_update" ON public.admin_notifications;
CREATE POLICY "admin_notifications_seller_update" ON public.admin_notifications
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'seller')
    AND (role_target IN ('seller','all') OR target_user_id = auth.uid())
  )
  WITH CHECK (public.has_role(auth.uid(), 'seller'));

-- user_roles: self read
DROP POLICY IF EXISTS "user_roles_self_select" ON public.user_roles;
CREATE POLICY "user_roles_self_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Item status change trigger -> order_events
CREATE OR REPLACE FUNCTION public.log_order_item_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.item_status IS DISTINCT FROM OLD.item_status THEN
    INSERT INTO public.order_events(order_id, type, old_status, new_status, message, created_by, metadata)
    VALUES (
      NEW.order_id,
      'item_status',
      OLD.item_status,
      NEW.item_status,
      'Item "' || COALESCE(NEW.product_name,'') || '" mudou para ' || NEW.item_status,
      auth.uid(),
      jsonb_build_object('order_item_id', NEW.id, 'product_id', NEW.product_id)
    );
    NEW.status_updated_at := now();
    NEW.status_updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_order_item_status_change_trg ON public.order_items;
CREATE TRIGGER log_order_item_status_change_trg
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.log_order_item_status_change();
