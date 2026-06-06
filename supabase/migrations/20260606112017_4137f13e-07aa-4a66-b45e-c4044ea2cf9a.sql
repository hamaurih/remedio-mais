
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('entrada','saida','ajuste','reserva','cancelamento')),
  quantity numeric NOT NULL,
  reason text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_order_idx ON public.stock_movements(order_id);

GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage stock_movements" ON public.stock_movements;
CREATE POLICY "Admins manage stock_movements" ON public.stock_movements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
