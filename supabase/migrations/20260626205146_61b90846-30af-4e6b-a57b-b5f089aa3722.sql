
ALTER TABLE public.trier_settings
  ADD COLUMN IF NOT EXISTS trier_payment_mode text NOT NULL DEFAULT 'pix_native'
    CHECK (trier_payment_mode IN ('pix_native','site_pix_card','site_debit_card','site_credit_card')),
  ADD COLUMN IF NOT EXISTS trier_pix_native_code integer DEFAULT 8,
  ADD COLUMN IF NOT EXISTS trier_site_pix_card_code integer DEFAULT 18,
  ADD COLUMN IF NOT EXISTS trier_site_debit_card_code integer DEFAULT 19,
  ADD COLUMN IF NOT EXISTS trier_site_credit_card_code integer DEFAULT 20;

UPDATE public.trier_settings SET
  trier_pix_native_code = COALESCE(trier_pix_native_code, 8),
  trier_site_pix_card_code = COALESCE(trier_site_pix_card_code, 18),
  trier_site_debit_card_code = COALESCE(trier_site_debit_card_code, 19),
  trier_site_credit_card_code = COALESCE(trier_site_credit_card_code, 20)
WHERE id = 1;
