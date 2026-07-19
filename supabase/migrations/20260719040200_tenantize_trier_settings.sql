-- Convert Trier settings from a global singleton to one row per store.

begin;

update public.trier_settings
set organization_id = coalesce(
      organization_id,
      '00000000-0000-0000-0000-000000000001'::uuid
    ),
    store_id = coalesce(
      store_id,
      '00000000-0000-0000-0000-000000000002'::uuid
    )
where organization_id is null or store_id is null;

alter table public.trier_settings
  alter column organization_id set not null,
  alter column store_id set not null,
  drop constraint if exists trier_settings_id_check;

create sequence if not exists public.trier_settings_id_seq;
alter sequence public.trier_settings_id_seq owned by public.trier_settings.id;

select setval(
  'public.trier_settings_id_seq',
  greatest(coalesce(max(id), 0), 1),
  coalesce(max(id), 0) > 0
)
from public.trier_settings;

alter table public.trier_settings
  alter column id set default nextval('public.trier_settings_id_seq');

create unique index if not exists trier_settings_tenant_uidx
  on public.trier_settings (organization_id, store_id);

drop policy if exists trier_settings_tenant_select on public.trier_settings;
create policy trier_settings_tenant_select
on public.trier_settings
as restrictive
for select
to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
);

drop policy if exists trier_settings_tenant_insert on public.trier_settings;
create policy trier_settings_tenant_insert
on public.trier_settings
as restrictive
for insert
to authenticated
with check (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
);

drop policy if exists trier_settings_tenant_update on public.trier_settings;
create policy trier_settings_tenant_update
on public.trier_settings
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

drop policy if exists trier_settings_tenant_delete on public.trier_settings;
create policy trier_settings_tenant_delete
on public.trier_settings
as restrictive
for delete
to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
);

commit;
