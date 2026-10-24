create table if not exists public.system_migration_jobs (
  job_key text primary key,
  status text not null,
  processed integer not null default 0,
  updated integer not null default 0,
  total integer,
  error text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.system_migration_jobs enable row level security;
revoke all on public.system_migration_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.system_migration_jobs to service_role;

create policy system_migration_jobs_deny_clients
on public.system_migration_jobs
for all
to anon, authenticated
using (false)
with check (false);

comment on table public.system_migration_jobs is 'Backend-only operational migration progress tracking.';
