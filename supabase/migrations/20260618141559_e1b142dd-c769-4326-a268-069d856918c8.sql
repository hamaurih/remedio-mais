
-- 1) Novas colunas em products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS bestseller_rank int,
  ADD COLUMN IF NOT EXISTS active_ingredient text,
  ADD COLUMN IF NOT EXISTS is_generic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generic_equivalent_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_bestseller_rank ON public.products(bestseller_rank) WHERE bestseller_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_active_ingredient ON public.products(lower(active_ingredient)) WHERE active_ingredient IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_is_generic ON public.products(is_generic) WHERE is_generic = true;
CREATE INDEX IF NOT EXISTS idx_products_generic_equivalent_id ON public.products(generic_equivalent_id) WHERE generic_equivalent_id IS NOT NULL;

-- 2) Tabela de relacionados manuais
CREATE TABLE IF NOT EXISTS public.product_related (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  related_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, related_product_id),
  CHECK (product_id <> related_product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_related_product_id ON public.product_related(product_id, position);

GRANT SELECT ON public.product_related TO anon, authenticated;
GRANT ALL ON public.product_related TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.product_related TO authenticated;

ALTER TABLE public.product_related ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_related public read"
  ON public.product_related FOR SELECT
  USING (true);

CREATE POLICY "product_related admin manage"
  ON public.product_related FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
