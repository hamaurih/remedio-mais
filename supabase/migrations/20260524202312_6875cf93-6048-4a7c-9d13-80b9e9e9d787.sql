CREATE TABLE public.promo_banner_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position integer NOT NULL DEFAULT 0,
  variant text NOT NULL DEFAULT 'default',
  title text,
  subtitle text,
  badge_text text,
  old_price numeric,
  new_price numeric,
  price_suffix text,
  image_url text,
  cta_text text,
  cta_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_banner_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo_blocks_public_read" ON public.promo_banner_blocks
  FOR SELECT USING (active = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "promo_blocks_admin_write" ON public.promo_banner_blocks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER promo_blocks_touch_updated_at
  BEFORE UPDATE ON public.promo_banner_blocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.promo_banner_blocks (position, variant, title, subtitle, badge_text, old_price, new_price, price_suffix, cta_text, cta_url) VALUES
(1, 'anniversary', 'Fraldas Huggies', 'Tripla proteção', '45 ANOS', 67.99, 32.90, 'a partir de', 'Aproveitar', '/buscar?q=huggies'),
(2, 'leve-pague', 'Desodorante Dove', 'Hidratação 48h', 'LEVE 3 PAGUE 2', NULL, NULL, NULL, 'Comprar agora', '/buscar?q=dove'),
(3, 'default', 'Cuidado Adulto Plenitud', 'Conforto e proteção', 'CUIDADO ADULTO', 127.99, 99.90, 'cada', 'Ver ofertas', '/buscar?q=plenitud'),
(4, 'desconto-2', 'Sustagen + Nutren', 'Nutrição completa', '60% OFF na 2ª un.', NULL, NULL, NULL, 'Aproveitar', '/buscar?q=sustagen'),
(5, 'generico', 'Especial do Genérico', 'Mesma fórmula, menor preço', 'ATÉ 30% OFF', NULL, NULL, NULL, 'Confira as ofertas', '/categoria/genericos');