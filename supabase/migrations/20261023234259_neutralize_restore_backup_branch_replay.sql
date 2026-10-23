-- Repair preview-branch migration replay after the August 2026 production restore.
create schema if not exists private;

create table if not exists private.migration_replay_archive_20261023 (
  version text primary key,
  name text not null,
  statements text[] not null,
  archived_at timestamptz not null default now()
);

insert into private.migration_replay_archive_20261023(version,name,statements)
select version,name,statements
from supabase_migrations.schema_migrations
where name like 'restore_backup_%'
on conflict (version) do nothing;

revoke all on table private.migration_replay_archive_20261023
  from public, anon, authenticated;

update supabase_migrations.schema_migrations
set statements = array[
  'select 1 /* restore_backup replay neutralized for preview branches; original statements archived in private.migration_replay_archive_20261023 */;'
]::text[]
where name like 'restore_backup_%';
