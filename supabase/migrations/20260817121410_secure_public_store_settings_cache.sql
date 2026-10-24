
create table if not exists public.store_settings_public_cache as
select
  id, whatsapp, address, instagram, hours, delivery_fee, delivery_mode,
  hero_title, hero_subtitle, store_name, served_neighborhoods, footer_text,
  sanitary_notice, legal_name, cnpj, state_registration, crf, afe,
  pharmacist_name, sanitary_license, contact_email, facebook, tiktok,
  pix_discount_percentage, pix_discount_enabled
from public.store_settings
with no data;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.store_settings_public_cache'::regclass
      and contype = 'p'
  ) then
    alter table public.store_settings_public_cache add primary key (id);
  end if;
end $$;

alter table public.store_settings_public_cache enable row level security;
revoke all on public.store_settings_public_cache from anon, authenticated;
grant select on public.store_settings_public_cache to anon, authenticated;

drop policy if exists store_settings_public_cache_read on public.store_settings_public_cache;
create policy store_settings_public_cache_read
on public.store_settings_public_cache
for select
to anon, authenticated
using (true);

create or replace function public.sync_store_settings_public_cache()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.store_settings_public_cache (
    id, whatsapp, address, instagram, hours, delivery_fee, delivery_mode,
    hero_title, hero_subtitle, store_name, served_neighborhoods, footer_text,
    sanitary_notice, legal_name, cnpj, state_registration, crf, afe,
    pharmacist_name, sanitary_license, contact_email, facebook, tiktok,
    pix_discount_percentage, pix_discount_enabled
  )
  values (
    new.id, new.whatsapp, new.address, new.instagram, new.hours, new.delivery_fee, new.delivery_mode,
    new.hero_title, new.hero_subtitle, new.store_name, new.served_neighborhoods, new.footer_text,
    new.sanitary_notice, new.legal_name, new.cnpj, new.state_registration, new.crf, new.afe,
    new.pharmacist_name, new.sanitary_license, new.contact_email, new.facebook, new.tiktok,
    new.pix_discount_percentage, new.pix_discount_enabled
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
    pix_discount_enabled = excluded.pix_discount_enabled;
  return new;
end;
$$;

revoke all on function public.sync_store_settings_public_cache() from public, anon, authenticated;

drop trigger if exists trg_sync_store_settings_public_cache on public.store_settings;
create trigger trg_sync_store_settings_public_cache
after insert or update on public.store_settings
for each row execute function public.sync_store_settings_public_cache();

insert into public.store_settings_public_cache (
  id, whatsapp, address, instagram, hours, delivery_fee, delivery_mode,
  hero_title, hero_subtitle, store_name, served_neighborhoods, footer_text,
  sanitary_notice, legal_name, cnpj, state_registration, crf, afe,
  pharmacist_name, sanitary_license, contact_email, facebook, tiktok,
  pix_discount_percentage, pix_discount_enabled
)
select
  id, whatsapp, address, instagram, hours, delivery_fee, delivery_mode,
  hero_title, hero_subtitle, store_name, served_neighborhoods, footer_text,
  sanitary_notice, legal_name, cnpj, state_registration, crf, afe,
  pharmacist_name, sanitary_license, contact_email, facebook, tiktok,
  pix_discount_percentage, pix_discount_enabled
from public.store_settings
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
  pix_discount_enabled = excluded.pix_discount_enabled;

create or replace view public.store_settings_public
with (security_invoker = true)
as
select * from public.store_settings_public_cache;

grant select on public.store_settings_public to anon, authenticated;
