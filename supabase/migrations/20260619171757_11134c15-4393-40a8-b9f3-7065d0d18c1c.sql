-- Recria a view com security_invoker=true (sem ERROR do linter)
DROP VIEW IF EXISTS public.store_settings_public;
CREATE VIEW public.store_settings_public
WITH (security_invoker = true) AS
SELECT
  id, whatsapp, address, instagram, hours, delivery_fee,
  hero_title, hero_subtitle, store_name, served_neighborhoods,
  footer_text, sanitary_notice, legal_name, cnpj, state_registration,
  crf, afe, pharmacist_name, sanitary_license, contact_email,
  facebook, tiktok, pix_discount_percentage, pix_discount_enabled
FROM public.store_settings;

GRANT SELECT ON public.store_settings_public TO anon, authenticated;
GRANT ALL ON public.store_settings_public TO service_role;

-- Permite leitura pública da tabela base (somente colunas seguras via GRANT a seguir)
GRANT SELECT (
  id, whatsapp, address, instagram, hours, delivery_fee,
  hero_title, hero_subtitle, store_name, served_neighborhoods,
  footer_text, sanitary_notice, legal_name, cnpj, state_registration,
  crf, afe, pharmacist_name, sanitary_license, contact_email,
  facebook, tiktok, pix_discount_percentage, pix_discount_enabled, updated_at
) ON public.store_settings TO anon, authenticated;

-- Política de leitura pública (RLS) — sem isso, os GRANT acima não bastam
DROP POLICY IF EXISTS settings_public_read ON public.store_settings;
CREATE POLICY settings_public_read ON public.store_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);