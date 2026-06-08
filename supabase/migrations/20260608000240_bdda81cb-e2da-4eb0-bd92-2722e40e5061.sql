
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS state_registration text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS facebook text,
  ADD COLUMN IF NOT EXISTS tiktok text;

DROP VIEW IF EXISTS public.store_settings_public;
CREATE VIEW public.store_settings_public
WITH (security_invoker=on) AS
SELECT id, whatsapp, address, instagram, hours, delivery_fee, hero_title, hero_subtitle,
  store_name, served_neighborhoods, footer_text, sanitary_notice,
  legal_name, cnpj, state_registration, crf, afe, pharmacist_name, sanitary_license,
  contact_email, facebook, tiktok,
  pix_discount_percentage, pix_discount_enabled
FROM public.store_settings;

GRANT SELECT ON public.store_settings_public TO anon, authenticated;
