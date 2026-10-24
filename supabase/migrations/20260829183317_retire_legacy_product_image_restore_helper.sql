drop function if exists public.service_restore_legacy_product_images(jsonb);
comment on table public.system_migration_jobs is 'Backend-only operational migration progress tracking; legacy visual migration endpoint retired after completion.';
