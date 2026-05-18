ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pix_discount_percentage numeric;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS pix_discount_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS pix_discount_percentage numeric NOT NULL DEFAULT 0;