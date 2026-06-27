ALTER TABLE public.trier_settings
  ADD COLUMN IF NOT EXISTS trier_test_customer_code integer,
  ADD COLUMN IF NOT EXISTS trier_test_seller_code integer,
  ADD COLUMN IF NOT EXISTS trier_test_seller_name text;