
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS publish_even_incomplete boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS quality_strict_mode text NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS quality_require_own_image boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_quality_strict_mode_check;
ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_quality_strict_mode_check
  CHECK (quality_strict_mode IN ('off','moderate','strict'));

CREATE INDEX IF NOT EXISTS idx_products_publish_incomplete
  ON public.products (publish_even_incomplete)
  WHERE publish_even_incomplete = true;
