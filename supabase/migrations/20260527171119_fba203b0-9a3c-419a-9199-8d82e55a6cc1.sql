
-- Home mosaic tiles
CREATE TABLE public.home_mosaic_tiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position integer NOT NULL DEFAULT 0,
  size text NOT NULL DEFAULT 'sm',
  title text,
  subtitle text,
  badge_text text,
  cta_text text,
  link text,
  image_url text,
  bg_style text NOT NULL DEFAULT 'soft-pink',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.home_mosaic_tiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_mosaic_tiles TO authenticated;
GRANT ALL ON public.home_mosaic_tiles TO service_role;
ALTER TABLE public.home_mosaic_tiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mosaic_public_read" ON public.home_mosaic_tiles
  FOR SELECT TO public
  USING (active = true OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "mosaic_admin_write" ON public.home_mosaic_tiles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_mosaic_updated BEFORE UPDATE ON public.home_mosaic_tiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Campaigns
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  starts_at timestamptz,
  ends_at timestamptz,
  banner_image_url text,
  banner_link text,
  cta_text text,
  subtitle text,
  visual_style text NOT NULL DEFAULT 'light',
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.campaigns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_public_read" ON public.campaigns
  FOR SELECT TO public
  USING (
    (active = true AND published = true
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at >= now())
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY "campaigns_admin_write" ON public.campaigns
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Campaign products (link table)
CREATE TABLE public.campaign_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, product_id)
);
GRANT SELECT ON public.campaign_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_products TO authenticated;
GRANT ALL ON public.campaign_products TO service_role;
ALTER TABLE public.campaign_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_products_public_read" ON public.campaign_products
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_products.campaign_id
        AND ((c.active = true AND c.published = true
              AND (c.starts_at IS NULL OR c.starts_at <= now())
              AND (c.ends_at IS NULL OR c.ends_at >= now()))
             OR has_role(auth.uid(), 'admin'::app_role))
    )
  );
CREATE POLICY "campaign_products_admin_write" ON public.campaign_products
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_campaign_products_campaign ON public.campaign_products(campaign_id, position);
CREATE INDEX idx_mosaic_position ON public.home_mosaic_tiles(position) WHERE active = true;
CREATE INDEX idx_campaigns_active ON public.campaigns(active, published, position);
