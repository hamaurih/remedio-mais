ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS title_font text,
  ADD COLUMN IF NOT EXISTS title_color text,
  ADD COLUMN IF NOT EXISTS support_color text,
  ADD COLUMN IF NOT EXISTS legal_color text,
  ADD COLUMN IF NOT EXISTS title_size text;