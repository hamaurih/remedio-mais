-- 1) Allow anon to evaluate has_role inside public_read RLS policies
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;

-- 2) Recreate the public store settings view as SECURITY DEFINER (default)
-- so anon can read non-sensitive published storefront fields without
-- exposing the base table.
DROP VIEW IF EXISTS public.store_settings_public;

CREATE VIEW public.store_settings_public AS
SELECT
  id,
  whatsapp,
  address,
  instagram,
  hours,
  delivery_fee,
  hero_title,
  hero_subtitle,
  store_name,
  served_neighborhoods,
  footer_text,
  sanitary_notice,
  legal_name,
  cnpj,
  crf,
  afe,
  pharmacist_name,
  sanitary_license,
  pix_discount_percentage,
  pix_discount_enabled
FROM public.store_settings;

GRANT SELECT ON public.store_settings_public TO anon, authenticated;