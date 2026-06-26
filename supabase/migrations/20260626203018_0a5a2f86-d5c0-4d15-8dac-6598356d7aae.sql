DROP POLICY IF EXISTS product_taxonomy_public_read ON public.product_taxonomy;
CREATE POLICY product_taxonomy_public_read ON public.product_taxonomy
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_taxonomy.product_id AND p.active = true));