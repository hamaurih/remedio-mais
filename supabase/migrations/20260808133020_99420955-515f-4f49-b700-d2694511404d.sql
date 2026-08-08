ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS site_discount_percentage numeric,
  ADD COLUMN IF NOT EXISTS whatsapp_discount_percentage numeric,
  ADD COLUMN IF NOT EXISTS lock_channel_discount boolean NOT NULL DEFAULT false;

UPDATE public.products
SET site_discount_percentage = ROUND((1 - (site_price / NULLIF(COALESCE(price_base, price), 0))) * 100, 2)
WHERE site_price IS NOT NULL AND site_price > 0
  AND COALESCE(price_base, price) > 0
  AND site_price < COALESCE(price_base, price)
  AND site_discount_percentage IS NULL;

UPDATE public.products
SET whatsapp_discount_percentage = ROUND((1 - (whatsapp_price / NULLIF(COALESCE(price_base, price), 0))) * 100, 2)
WHERE whatsapp_price IS NOT NULL AND whatsapp_price > 0
  AND COALESCE(price_base, price) > 0
  AND whatsapp_price < COALESCE(price_base, price)
  AND whatsapp_discount_percentage IS NULL;