-- Permitir leitura pública da view store_settings_public (campos não sensíveis)
-- Recria a view com security_invoker=false para que ela use os privilégios do owner
-- e contorne o RLS restritivo da tabela base store_settings (admin-only).
DROP VIEW IF EXISTS public.store_settings_public;
CREATE VIEW public.store_settings_public
WITH (security_invoker = false) AS
SELECT
  id, whatsapp, address, instagram, hours, delivery_fee,
  hero_title, hero_subtitle, store_name, served_neighborhoods,
  footer_text, sanitary_notice, legal_name, cnpj, state_registration,
  crf, afe, pharmacist_name, sanitary_license, contact_email,
  facebook, tiktok, pix_discount_percentage, pix_discount_enabled
FROM public.store_settings;

GRANT SELECT ON public.store_settings_public TO anon, authenticated;
GRANT ALL ON public.store_settings_public TO service_role;