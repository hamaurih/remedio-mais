-- Convert Mercado Pago settings from a global singleton to one row per store.

begin;

update public.payment_settings
set organization_id = coalesce(
      organization_id,
      '00000000-0000-0000-0000-000000000001'::uuid
    ),
    store_id = coalesce(
      store_id,
      '00000000-0000-0000-0000-000000000002'::uuid
    )
where organization_id is null or store_id is null;

alter table public.payment_settings
  alter column organization_id set not null,
  alter column store_id set not null,
  drop constraint if exists payment_settings_singleton;

create sequence if not exists public.payment_settings_id_seq;
alter sequence public.payment_settings_id_seq owned by public.payment_settings.id;

select setval(
  'public.payment_settings_id_seq',
  greatest(coalesce(max(id), 0), 1),
  coalesce(max(id), 0) > 0
)
from public.payment_settings;

alter table public.payment_settings
  alter column id set default nextval('public.payment_settings_id_seq');

create unique index if not exists payment_settings_tenant_uidx
  on public.payment_settings (organization_id, store_id);

drop policy if exists payment_settings_tenant_select on public.payment_settings;
create policy payment_settings_tenant_select
on public.payment_settings
as restrictive
for select
to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
);

drop policy if exists payment_settings_tenant_insert on public.payment_settings;
create policy payment_settings_tenant_insert
on public.payment_settings
as restrictive
for insert
to authenticated
with check (
  private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'manager']
  )
);

drop policy if exists payment_settings_tenant_update on public.payment_settings;
create policy payment_settings_tenant_update
on public.payment_settings
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

drop policy if exists payment_settings_tenant_delete on public.payment_settings;
create policy payment_settings_tenant_delete
on public.payment_settings
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
