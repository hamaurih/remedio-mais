CREATE TABLE IF NOT EXISTS public.home_shelf_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shelf_key text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shelf_key, product_id)
);

CREATE INDEX IF NOT EXISTS idx_home_shelf_items_key_pos ON public.home_shelf_items (shelf_key, position);

GRANT SELECT ON public.home_shelf_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_shelf_items TO authenticated;
GRANT ALL ON public.home_shelf_items TO service_role;

ALTER TABLE public.home_shelf_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vitrines visíveis publicamente"
ON public.home_shelf_items FOR SELECT
USING (true);

CREATE POLICY "Admins gerenciam vitrines"
ON public.home_shelf_items FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));