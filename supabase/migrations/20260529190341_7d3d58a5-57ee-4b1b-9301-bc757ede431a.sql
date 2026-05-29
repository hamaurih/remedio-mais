-- Mosaic tiles: add real entity links
ALTER TABLE public.home_mosaic_tiles
  ADD COLUMN IF NOT EXISTS link_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS image_source text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS custom_image_url text,
  ADD COLUMN IF NOT EXISTS manual_link text,
  ADD COLUMN IF NOT EXISTS badge_preset text;

-- Campaigns: banner mode + destination + show_on_home
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS banner_mode text NOT NULL DEFAULT 'manual_url',
  ADD COLUMN IF NOT EXISTS banner_destination text NOT NULL DEFAULT 'campaign',
  ADD COLUMN IF NOT EXISTS destination_category_id uuid,
  ADD COLUMN IF NOT EXISTS destination_product_id uuid,
  ADD COLUMN IF NOT EXISTS show_on_home boolean NOT NULL DEFAULT false;

-- Campaign products: featured slot for auto banner
ALTER TABLE public.campaign_products
  ADD COLUMN IF NOT EXISTS featured_slot smallint;