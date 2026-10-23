create schema if not exists private;

create table if not exists private.migration_history_repair_backup (
  backed_up_at timestamptz not null default now(),
  version text not null,
  statements text[],
  name text,
  created_by text,
  idempotency_key text,
  rollback text[],
  reason text not null,
  primary key (version, reason)
);

insert into private.migration_history_repair_backup(
  version, statements, name, created_by, idempotency_key, rollback, reason
)
select version, statements, name, created_by, idempotency_key, rollback,
       'branch_replay_fk_repair_20261023'
from supabase_migrations.schema_migrations
where version='20260824185015'
on conflict (version, reason) do nothing;

revoke all on private.migration_history_repair_backup from public, anon, authenticated;
