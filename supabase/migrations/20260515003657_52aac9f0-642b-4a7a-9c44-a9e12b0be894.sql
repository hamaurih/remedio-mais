ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shelves text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS cta_text text;