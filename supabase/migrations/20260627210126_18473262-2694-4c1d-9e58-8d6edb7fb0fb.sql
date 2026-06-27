ALTER TABLE public.trier_settings
  ADD COLUMN IF NOT EXISTS trier_sales_base_url text,
  ADD COLUMN IF NOT EXISTS trier_sales_base_mode text DEFAULT 'gateway';

UPDATE public.trier_settings
  SET trier_sales_base_mode = COALESCE(trier_sales_base_mode, 'gateway')
  WHERE id = 1;