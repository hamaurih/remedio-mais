alter table public.store_settings
  add column if not exists whatsapp_response_time_minutes integer
  check (whatsapp_response_time_minutes is null or whatsapp_response_time_minutes between 1 and 1440);

alter table public.store_settings_public_cache
  add column if not exists whatsapp_response_time_minutes integer;

create or replace function public.sync_store_settings_public_cache()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.store_settings_public_cache (
    id, whatsapp, address, instagram, hours, delivery_fee, delivery_mode,
    hero_title, hero_subtitle, store_name, served_neighborhoods, footer_text,
    sanitary_notice, legal_name, cnpj, state_registration, crf, afe,
    pharmacist_name, sanitary_license, contact_email, facebook, tiktok,
    pix_discount_percentage, pix_discount_enabled, whatsapp_response_time_minutes
  )
  values (
    new.id, new.whatsapp, new.address, new.instagram, new.hours, new.delivery_fee, new.delivery_mode,
    new.hero_title, new.hero_subtitle, new.store_name, new.served_neighborhoods, new.footer_text,
    new.sanitary_notice, new.legal_name, new.cnpj, new.state_registration, new.crf, new.afe,
    new.pharmacist_name, new.sanitary_license, new.contact_email, new.facebook, new.tiktok,
    new.pix_discount_percentage, new.pix_discount_enabled, new.whatsapp_response_time_minutes
  )
  on conflict (id) do update set
    whatsapp = excluded.whatsapp,
    address = excluded.address,
    instagram = excluded.instagram,
    hours = excluded.hours,
    delivery_fee = excluded.delivery_fee,
    delivery_mode = excluded.delivery_mode,
    hero_title = excluded.hero_title,
    hero_subtitle = excluded.hero_subtitle,
    store_name = excluded.store_name,
    served_neighborhoods = excluded.served_neighborhoods,
    footer_text = excluded.footer_text,
    sanitary_notice = excluded.sanitary_notice,
    legal_name = excluded.legal_name,
    cnpj = excluded.cnpj,
    state_registration = excluded.state_registration,
    crf = excluded.crf,
    afe = excluded.afe,
    pharmacist_name = excluded.pharmacist_name,
    sanitary_license = excluded.sanitary_license,
    contact_email = excluded.contact_email,
    facebook = excluded.facebook,
    tiktok = excluded.tiktok,
    pix_discount_percentage = excluded.pix_discount_percentage,
    pix_discount_enabled = excluded.pix_discount_enabled,
    whatsapp_response_time_minutes = excluded.whatsapp_response_time_minutes;
  return new;
end;
$$;

create or replace view public.store_settings_public as
select
  id, whatsapp, address, instagram, hours, delivery_fee, delivery_mode,
  hero_title, hero_subtitle, store_name, served_neighborhoods, footer_text,
  sanitary_notice, legal_name, cnpj, state_registration, crf, afe,
  pharmacist_name, sanitary_license, contact_email, facebook, tiktok,
  pix_discount_percentage, pix_discount_enabled, whatsapp_response_time_minutes
from public.store_settings_public_cache;

update public.store_settings_public_cache c
set whatsapp_response_time_minutes = s.whatsapp_response_time_minutes
from public.store_settings s
where c.id = s.id;
