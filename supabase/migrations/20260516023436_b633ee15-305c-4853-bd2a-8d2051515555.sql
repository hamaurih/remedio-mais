
-- Products: extended fields
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS gallery_images text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS promotion_start timestamptz,
  ADD COLUMN IF NOT EXISTS promotion_end timestamptz,
  ADD COLUMN IF NOT EXISTS minimum_stock integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS product_badge text,
  ADD COLUMN IF NOT EXISTS custom_warning text,
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS seo_keywords text,
  ADD COLUMN IF NOT EXISTS discount_percentage integer
    GENERATED ALWAYS AS (
      CASE WHEN price > 0 AND promo_price IS NOT NULL AND promo_price < price
        THEN ROUND(((1 - (promo_price / price)) * 100))::int
        ELSE 0 END
    ) STORED;

-- Categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS show_in_menu boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_on_home boolean NOT NULL DEFAULT true;

-- Banners
ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS mobile_image_url text,
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS end_date timestamptz,
  ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'hero';

-- Orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Prescriptions
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Store settings: legal/operational fields
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS served_neighborhoods text,
  ADD COLUMN IF NOT EXISTS footer_text text,
  ADD COLUMN IF NOT EXISTS sanitary_notice text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS pharmacist_name text,
  ADD COLUMN IF NOT EXISTS crf text,
  ADD COLUMN IF NOT EXISTS sanitary_license text,
  ADD COLUMN IF NOT EXISTS afe text;

-- updated_at triggers (idempotent)
DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_prescriptions_updated_at ON public.prescriptions;
CREATE TRIGGER trg_prescriptions_updated_at BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
