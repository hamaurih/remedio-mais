
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS commercial_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS show_in_menu boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_in_filters boolean NOT NULL DEFAULT true;
