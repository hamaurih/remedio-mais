DROP VIEW public.store_settings_public;
CREATE VIEW public.store_settings_public AS
 SELECT id,
    whatsapp,
    address,
    instagram,
    hours,
    delivery_fee,
    delivery_mode,
    hero_title,
    hero_subtitle,
    store_name,
    served_neighborhoods,
    footer_text,
    sanitary_notice,
    legal_name,
    cnpj,
    state_registration,
    crf,
    afe,
    pharmacist_name,
    sanitary_license,
    contact_email,
    facebook,
    tiktok,
    pix_discount_percentage,
    pix_discount_enabled
   FROM store_settings;
GRANT SELECT ON public.store_settings_public TO anon, authenticated;
GRANT ALL ON public.store_settings_public TO service_role;