alter table public.marketing_settings
  add column if not exists ga_enabled boolean not null default false,
  add column if not exists ga_measurement_id text,
  add column if not exists ga_consent_required boolean not null default true;

create or replace function public.public_ga_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', coalesce(m.ga_enabled, false),
    'measurement_id',
      case
        when coalesce(m.ga_enabled, false)
         and m.ga_measurement_id ~ '^G-[A-Z0-9]+$'
        then m.ga_measurement_id
        else null
      end,
    'consent_required', coalesce(m.ga_consent_required, true)
  )
  from public.marketing_settings m
  where m.id = 1
$$;

revoke all on function public.public_ga_config() from public;
grant execute on function public.public_ga_config() to anon, authenticated;
