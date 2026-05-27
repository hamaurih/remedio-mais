ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS band_color text DEFAULT '#E11D2E';