ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS background_intensity text DEFAULT 'xsoft',
  ADD COLUMN IF NOT EXISTS side_shapes_size text DEFAULT 'medium';