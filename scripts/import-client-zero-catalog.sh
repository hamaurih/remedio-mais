#!/usr/bin/env bash
set -Eeuo pipefail

# Imports only catalog/content/configuration data from the validated Lovable dump.
# Auth, customer, order, payment-event and Storage data are intentionally excluded.

readonly EXPECTED_SHA256="6ea166afffc29387f7873f146c050e0941ff9b776ac872860deaba59f8fdadd9"
readonly DEV_PROJECT_REF="paftzdjmgkbtxvobcftr"
readonly ORGANIZATION_ID="00000000-0000-0000-0000-000000000001"
readonly STORE_ID="00000000-0000-0000-0000-000000000002"

: "${BACKUP_FILE:?Set BACKUP_FILE to the validated .backup path}"
: "${TARGET_DB_URL:?Set TARGET_DB_URL to the development Session Pooler URL}"

if [[ "${TARGET_DB_URL}" != *"${DEV_PROJECT_REF}"* ]]; then
  echo "Refusing target: the connection URL is not the approved development project." >&2
  exit 2
fi

for command_name in pg_restore psql sha256sum; do
  command -v "${command_name}" >/dev/null || {
    echo "Missing required command: ${command_name}" >&2
    exit 2
  }
done

[[ -r "${BACKUP_FILE}" ]] || {
  echo "Backup file is not readable." >&2
  exit 2
}

actual_sha256="$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')"
[[ "${actual_sha256}" == "${EXPECTED_SHA256}" ]] || {
  echo "Backup checksum mismatch." >&2
  exit 2
}

pg_restore --list "${BACKUP_FILE}" >/dev/null

readonly TABLES=(
  departments
  categories
  subcategories
  products
  product_variants
  product_related
  product_taxonomy
  banners
  campaigns
  campaign_products
  home_layout
  home_mosaic_tiles
  menu_items
  promo_banner_blocks
  store_settings
  trier_settings
  payment_settings
)

table_args=()
for table_name in "${TABLES[@]}"; do
  table_args+=(--table="public.${table_name}")
done

preflight_sql="
select case
  when exists(select 1 from public.organizations where id = '${ORGANIZATION_ID}'::uuid)
   and exists(select 1 from public.stores where id = '${STORE_ID}'::uuid and organization_id = '${ORGANIZATION_ID}'::uuid)
  then 'tenant-ok' else 'tenant-missing' end;
select coalesce(sum(row_count), 0) from (
  select count(*) row_count from public.products
  union all select count(*) from public.categories
  union all select count(*) from public.departments
  union all select count(*) from public.banners
  union all select count(*) from public.store_settings
  union all select count(*) from public.trier_settings
  union all select count(*) from public.payment_settings
) counts;"

mapfile -t preflight < <(psql "${TARGET_DB_URL}" -X -A -t -v ON_ERROR_STOP=1 -c "${preflight_sql}")
[[ "${preflight[0]:-}" == "tenant-ok" ]] || {
  echo "Client-zero tenant is missing from the target." >&2
  exit 3
}
[[ "${preflight[1]:-}" == "0" ]] || {
  echo "Target catalog/configuration tables are not empty; refusing a non-idempotent import." >&2
  exit 3
}

cleanup_defaults() {
  psql "${TARGET_DB_URL}" -X -q -v ON_ERROR_STOP=1 <<SQL
alter table public.store_settings alter column organization_id drop default;
alter table public.store_settings alter column store_id drop default;
alter table public.trier_settings alter column organization_id drop default;
alter table public.trier_settings alter column store_id drop default;
alter table public.payment_settings alter column organization_id drop default;
alter table public.payment_settings alter column store_id drop default;
SQL
}
trap cleanup_defaults EXIT

psql "${TARGET_DB_URL}" -X -q -v ON_ERROR_STOP=1 <<SQL
alter table public.store_settings alter column organization_id set default '${ORGANIZATION_ID}'::uuid;
alter table public.store_settings alter column store_id set default '${STORE_ID}'::uuid;
alter table public.trier_settings alter column organization_id set default '${ORGANIZATION_ID}'::uuid;
alter table public.trier_settings alter column store_id set default '${STORE_ID}'::uuid;
alter table public.payment_settings alter column organization_id set default '${ORGANIZATION_ID}'::uuid;
alter table public.payment_settings alter column store_id set default '${STORE_ID}'::uuid;
SQL

pg_restore \
  --dbname="${TARGET_DB_URL}" \
  --data-only \
  --single-transaction \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  "${table_args[@]}" \
  "${BACKUP_FILE}"

psql "${TARGET_DB_URL}" -X -q -v ON_ERROR_STOP=1 <<'SQL'
select setval(pg_get_serial_sequence('public.store_settings', 'id'), coalesce((select max(id) from public.store_settings), 1), true);
select setval(pg_get_serial_sequence('public.trier_settings', 'id'), coalesce((select max(id) from public.trier_settings), 1), true);
select setval(pg_get_serial_sequence('public.payment_settings', 'id'), coalesce((select max(id) from public.payment_settings), 1), true);
analyze public.products;
analyze public.categories;
analyze public.departments;
SQL

validation="$(psql "${TARGET_DB_URL}" -X -A -t -v ON_ERROR_STOP=1 <<SQL
select jsonb_build_object(
  'products', (select count(*) from public.products),
  'categories', (select count(*) from public.categories),
  'departments', (select count(*) from public.departments),
  'banners', (select count(*) from public.banners),
  'store_settings', (select count(*) from public.store_settings),
  'wrong_tenant', (
    select count(*) from public.products
    where organization_id <> '${ORGANIZATION_ID}'::uuid or store_id <> '${STORE_ID}'::uuid
  ),
  'products_without_category', (
    select count(*) from public.products p
    left join public.categories c on c.id = p.category_id
    where p.category_id is not null and c.id is null
  )
);
SQL
)"

echo "Catalog import validation: ${validation}"

