ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS product_size text DEFAULT 'large',
  ADD COLUMN IF NOT EXISTS show_side_shapes boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS side_shapes_color text;