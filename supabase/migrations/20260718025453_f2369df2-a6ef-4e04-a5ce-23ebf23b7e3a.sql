
-- Speed up storefront product listing queries (active + stock + shelves tag)
CREATE INDEX IF NOT EXISTS idx_products_shelves_gin
  ON public.products USING gin (shelves)
  WHERE active = true AND stock > 0;

CREATE INDEX IF NOT EXISTS idx_products_active_stock_category
  ON public.products (category_id)
  WHERE active = true AND stock > 0;

CREATE INDEX IF NOT EXISTS idx_products_on_sale
  ON public.products (on_sale)
  WHERE active = true AND stock > 0 AND on_sale = true;

CREATE INDEX IF NOT EXISTS idx_products_updated_at
  ON public.products (updated_at DESC)
  WHERE active = true AND stock > 0;

-- Speed up sync log count-by-date used in admin
CREATE INDEX IF NOT EXISTS idx_psl_created_at
  ON public.product_sync_logs (created_at DESC);

-- Ensure missing home_layout row for the mini promo banner row (so admin can toggle it)
INSERT INTO public.home_layout (section_key, label, position, enabled)
VALUES ('promo_mini_banner_row', 'Mini banners promocionais', 25, true)
ON CONFLICT (section_key) DO NOTHING;
