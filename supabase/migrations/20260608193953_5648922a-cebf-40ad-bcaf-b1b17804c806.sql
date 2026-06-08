CREATE TABLE IF NOT EXISTS public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_area text NOT NULL,
  label text NOT NULL,
  slug text,
  link_type text NOT NULL DEFAULT 'manual',
  url text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  page_key text,
  parent_id uuid REFERENCES public.menu_items(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  show_on_desktop boolean NOT NULL DEFAULT true,
  show_on_mobile boolean NOT NULL DEFAULT true,
  open_in_new_tab boolean NOT NULL DEFAULT false,
  icon text,
  badge_text text,
  highlight boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.menu_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_items public read active"
  ON public.menu_items FOR SELECT
  USING (active = true);

CREATE POLICY "menu_items admin all"
  ON public.menu_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS menu_items_area_idx ON public.menu_items(menu_area, position);
CREATE INDEX IF NOT EXISTS menu_items_parent_idx ON public.menu_items(parent_id);

CREATE TRIGGER menu_items_touch_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed: header_main (chips) baseado nas categorias ativas e marcadas para o menu
INSERT INTO public.menu_items (menu_area, label, slug, link_type, category_id, url, position, active)
SELECT 'header_main', c.name, c.slug, 'category', c.id, '/categoria/' || c.slug, COALESCE(c.position, 0), true
FROM public.categories c
WHERE c.active = true AND COALESCE(c.show_in_menu, true) = true
ON CONFLICT DO NOTHING;

-- Seed: all_categories (mega menu) — todas as ativas
INSERT INTO public.menu_items (menu_area, label, slug, link_type, category_id, url, position, active)
SELECT 'all_categories', c.name, c.slug, 'category', c.id, '/categoria/' || c.slug, COALESCE(c.position, 0), true
FROM public.categories c
WHERE c.active = true
ON CONFLICT DO NOTHING;

-- Seed: footer institucional
INSERT INTO public.menu_items (menu_area, label, link_type, page_key, url, position) VALUES
  ('footer_institutional', 'Sobre a farmácia', 'page', 'about', '/sobre', 1),
  ('footer_institutional', 'Fale Conosco', 'page', 'contact', '/contato', 2),
  ('footer_institutional', 'Política de Privacidade', 'page', 'privacy', '/politica-de-privacidade', 3),
  ('footer_institutional', 'Termos de Uso', 'page', 'terms', '/termos', 4)
ON CONFLICT DO NOTHING;

-- Seed: footer atendimento
INSERT INTO public.menu_items (menu_area, label, link_type, page_key, url, position) VALUES
  ('footer_support', 'Envie sua receita', 'page', 'send_prescription', '/enviar-receita', 1),
  ('footer_support', 'Trocas e Devoluções', 'page', 'returns', '/trocas-e-devolucoes', 2),
  ('footer_support', 'Fale Conosco', 'page', 'contact', '/contato', 3)
ON CONFLICT DO NOTHING;

-- Seed: footer categorias
INSERT INTO public.menu_items (menu_area, label, slug, link_type, category_id, url, position, active)
SELECT 'footer_categories', c.name, c.slug, 'category', c.id, '/categoria/' || c.slug, COALESCE(c.position, 0), true
FROM public.categories c
WHERE c.active = true AND COALESCE(c.show_in_menu, true) = true
LIMIT 8
ON CONFLICT DO NOTHING;