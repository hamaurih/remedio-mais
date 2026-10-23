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

revoke all on private.migration_history_repair_backup from public, anon, authenticated;
