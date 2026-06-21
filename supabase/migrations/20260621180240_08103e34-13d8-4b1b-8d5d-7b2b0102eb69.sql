
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_base numeric,
  ADD COLUMN IF NOT EXISTS site_price numeric,
  ADD COLUMN IF NOT EXISTS whatsapp_price numeric,
  ADD COLUMN IF NOT EXISTS site_promo_price numeric,
  ADD COLUMN IF NOT EXISTS whatsapp_promo_price numeric,
  ADD COLUMN IF NOT EXISTS discount_percentage numeric,
  ADD COLUMN IF NOT EXISTS use_channel_pricing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS channel_price_notes text;

ALTER TABLE public.trier_settings
  ADD COLUMN IF NOT EXISTS allow_overwrite_site_price boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_overwrite_whatsapp_price boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sales_channel text NOT NULL DEFAULT 'site';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_sales_channel_check') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_sales_channel_check
      CHECK (sales_channel IN ('site','whatsapp','balcao','telefone'));
  END IF;
END $$;

REVOKE SELECT (price_base, site_price, whatsapp_price, site_promo_price, whatsapp_promo_price, channel_price_notes, use_channel_pricing, discount_percentage)
  ON public.products FROM anon, authenticated;
GRANT SELECT (site_price, site_promo_price, discount_percentage) ON public.products TO anon, authenticated;
