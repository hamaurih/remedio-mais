
-- Add new columns to banners for pro refactor. All additive with defaults.
ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS visual_model text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS size_variant text NOT NULL DEFAULT 'hero-grande',
  ADD COLUMN IF NOT EXISTS desktop_image_url text,
  ADD COLUMN IF NOT EXISTS tablet_image_url text,
  ADD COLUMN IF NOT EXISTS image_focus text NOT NULL DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS image_alt text,
  ADD COLUMN IF NOT EXISTS badge text,
  ADD COLUMN IF NOT EXISTS highlight_price numeric,
  ADD COLUMN IF NOT EXISTS secondary_image_url text,
  ADD COLUMN IF NOT EXISTS autoplay_delay integer NOT NULL DEFAULT 4000,
  ADD COLUMN IF NOT EXISTS transition_type text NOT NULL DEFAULT 'slide',
  ADD COLUMN IF NOT EXISTS linked_product_id uuid,
  ADD COLUMN IF NOT EXISTS linked_campaign_id uuid,
  ADD COLUMN IF NOT EXISTS linked_category_id uuid;

-- Backfill desktop_image_url from legacy fields where missing
UPDATE public.banners
   SET desktop_image_url = COALESCE(desktop_image_url, image_url, background_image_url)
 WHERE desktop_image_url IS NULL;

-- Foreign keys (best-effort; only add if referenced tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='products') THEN
    BEGIN
      ALTER TABLE public.banners
        ADD CONSTRAINT banners_linked_product_fk
        FOREIGN KEY (linked_product_id) REFERENCES public.products(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='campaigns') THEN
    BEGIN
      ALTER TABLE public.banners
        ADD CONSTRAINT banners_linked_campaign_fk
        FOREIGN KEY (linked_campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='categories') THEN
    BEGIN
      ALTER TABLE public.banners
        ADD CONSTRAINT banners_linked_category_fk
        FOREIGN KEY (linked_category_id) REFERENCES public.categories(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- Re-affirm GRANTs
GRANT SELECT ON public.banners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.banners TO authenticated;
GRANT ALL ON public.banners TO service_role;
