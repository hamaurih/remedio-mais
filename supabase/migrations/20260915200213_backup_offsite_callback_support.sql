
alter table public.backup_artifacts
  add column if not exists offsite_callback_hash text;


-- Preview replay: external offsite callback configuration intentionally omitted.
