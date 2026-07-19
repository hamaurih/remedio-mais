-- Convert the legacy singleton settings row into one row per organization/store
-- and expose only public fields through a security-invoker view.

begin;

update public.store_settings
set organization_id = coalesce(
      organization_id,
      '00000000-0000-0000-0000-000000000001'::uuid
    ),
    store_id = coalesce(
      store_id,
      '00000000-0000-0000-0000-000000000002'::uuid
    )
where organization_id is null or store_id is null;

alter table public.store_settings
  alter column organization_id set not null,
  alter column store_id set not null,
  drop constraint if exists single_row;

create sequence if not exists public.store_settings_id_seq;
alter sequence public.store_settings_id_seq owned by public.store_settings.id;

select setval(
  'public.store_settings_id_seq',
  greatest(coalesce(max(id), 0), 1),
  coalesce(max(id), 0) > 0
)
from public.store_settings;

alter table public.store_settings
  alter column id set default nextval('public.store_settings_id_seq');

create unique index if not exists store_settings_tenant_uidx
  on public.store_settings (organization_id, store_id);

drop policy if exists store_settings_tenant_insert on public.store_settings;
create policy store_settings_tenant_insert
on public.store_settings
as restrictive
for insert
to authenticated
with check (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
);

drop policy if exists store_settings_tenant_update on public.store_settings;
create policy store_settings_tenant_update
on public.store_settings
as restrictive
for update
to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
)
with check (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
);

drop policy if exists store_settings_tenant_delete on public.store_settings;
create policy store_settings_tenant_delete
on public.store_settings
as restrictive
for delete
to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
);

drop policy if exists settings_public_read on public.store_settings;
create policy settings_public_read
on public.store_settings
for select
to anon, authenticated
using (true);

drop view if exists public.store_settings_public;
create view public.store_settings_public
with (security_invoker = true) as
select
  id,
  organization_id,
  store_id,
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
  state_registration,
  crf,
  afe,
  pharmacist_name,
  sanitary_license,
  contact_email,
  facebook,
  tiktok,
  pix_discount_percentage,
  pix_discount_enabled,
  updated_at
from public.store_settings;

revoke all on public.store_settings_public from public, anon, authenticated;
grant select on public.store_settings_public to anon, authenticated;
grant all on public.store_settings_public to service_role;

grant select (
  id,
  organization_id,
  store_id,
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
  state_registration,
  crf,
  afe,
  pharmacist_name,
  sanitary_license,
  contact_email,
  facebook,
  tiktok,
  pix_discount_percentage,
  pix_discount_enabled,
  updated_at
) on public.store_settings to anon, authenticated;

commit;
