
-- 1) orders: novos campos
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS trier_order_id text,
  ADD COLUMN IF NOT EXISTS trier_sale_id text,
  ADD COLUMN IF NOT EXISTS trier_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trier_payload_hash text,
  ADD COLUMN IF NOT EXISTS trier_last_error text;

CREATE INDEX IF NOT EXISTS idx_orders_trier_sent ON public.orders(trier_sent);
CREATE INDEX IF NOT EXISTS idx_orders_trier_order_id ON public.orders(trier_order_id);

-- 2) order_items: novos campos
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS trier_product_id text,
  ADD COLUMN IF NOT EXISTS trier_item_sent boolean NOT NULL DEFAULT false;

-- 3) trier_settings: novos campos de configuração do envio e-commerce
ALTER TABLE public.trier_settings
  ADD COLUMN IF NOT EXISTS auto_send_orders_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pix_payment_code integer,
  ADD COLUMN IF NOT EXISTS card_payment_code integer,
  ADD COLUMN IF NOT EXISTS seller_code integer,
  ADD COLUMN IF NOT EXISTS seller_name text,
  ADD COLUMN IF NOT EXISTS delivery_fee_product_code text,
  ADD COLUMN IF NOT EXISTS delivery_fee_product_name text;

-- 4) trier_order_logs
CREATE TABLE IF NOT EXISTS public.trier_order_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  action text NOT NULL,
  endpoint text,
  http_status integer,
  status text,
  request_payload_masked jsonb,
  response_payload_masked jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT ON public.trier_order_logs TO authenticated;
GRANT ALL ON public.trier_order_logs TO service_role;

ALTER TABLE public.trier_order_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trier_order_logs_admin_select"
  ON public.trier_order_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_trier_order_logs_order_id ON public.trier_order_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_trier_order_logs_created_at ON public.trier_order_logs(created_at DESC);
