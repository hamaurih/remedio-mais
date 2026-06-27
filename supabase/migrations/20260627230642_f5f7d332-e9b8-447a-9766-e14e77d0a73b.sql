ALTER TABLE public.trier_settings
  ADD COLUMN IF NOT EXISTS trier_customer_mode text NOT NULL DEFAULT 'no_code'
  CHECK (trier_customer_mode IN ('no_code','real_code','no_customer'));