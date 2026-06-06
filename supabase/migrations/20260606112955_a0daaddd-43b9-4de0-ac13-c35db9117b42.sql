
-- 1. Recria view com security_invoker
DROP VIEW IF EXISTS public.store_settings_public;
CREATE VIEW public.store_settings_public
  WITH (security_invoker=true) AS
SELECT id, whatsapp, address, instagram, hours, delivery_fee, hero_title, hero_subtitle,
       store_name, served_neighborhoods, footer_text, sanitary_notice, legal_name, cnpj,
       crf, afe, pharmacist_name, sanitary_license, pix_discount_percentage, pix_discount_enabled
FROM public.store_settings;
GRANT SELECT ON public.store_settings_public TO anon, authenticated;

-- 2. Remove policies amplas de listagem nos buckets públicos
-- (acesso por URL pública continua funcionando — não depende de policy)
DROP POLICY IF EXISTS products_public_read ON storage.objects;
DROP POLICY IF EXISTS banners_public_read ON storage.objects;

-- 3. Endurece EXECUTE das funções SECURITY DEFINER
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_order_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
-- has_role precisa permanecer chamável por authenticated (usada dentro das RLS policies)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
