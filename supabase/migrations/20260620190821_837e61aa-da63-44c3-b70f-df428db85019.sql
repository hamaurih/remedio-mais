
ALTER TABLE public.promo_banner_blocks
  ADD COLUMN IF NOT EXISTS theme_key text DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS background_image_url text,
  ADD COLUMN IF NOT EXISTS background_intensity text DEFAULT 'soft',
  ADD COLUMN IF NOT EXISTS decoration_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS custom_background_color text,
  ADD COLUMN IF NOT EXISTS custom_cta_color text,
  ADD COLUMN IF NOT EXISTS custom_badge_color text;
