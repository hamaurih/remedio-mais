CREATE TABLE public.home_layout (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL UNIQUE,
  label text NOT NULL,
  position integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.home_layout TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_layout TO authenticated;
GRANT ALL ON public.home_layout TO service_role;

ALTER TABLE public.home_layout ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_layout_public_read" ON public.home_layout
  FOR SELECT USING (true);

CREATE POLICY "home_layout_admin_all" ON public.home_layout
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_home_layout_updated_at
  BEFORE UPDATE ON public.home_layout
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.home_layout (section_key, label, position, enabled) VALUES
  ('promo_mosaic',       'Mosaico de 4 cards',      10, true),
  ('hero_carousel',      'Hero (banner carrossel)', 20, true),
  ('promo_ticker',       'Faixa promo (WhatsApp / Google)', 30, true),
  ('campaign_shelf',     'Campanha ativa',          40, true),
  ('benefit_cards',      'Cards de benefícios',     50, true),
  ('department_carousel','Carrossel de departamentos', 60, true),
  ('product_shelves',    'Prateleiras de produtos (bloco)', 70, true),
  ('prescription_cta',   'CTA de receita médica',   80, true),
  ('google_rating',      'Bloco de avaliação Google',90, true),
  ('location',           'Localização da loja',    100, true);
