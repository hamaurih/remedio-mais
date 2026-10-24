
alter table public.backup_artifacts
  add column if not exists integrity_verified boolean not null default false,
  add column if not exists integrity_verified_at timestamptz,
  add column if not exists integrity_error text;

create index if not exists backup_artifacts_integrity_idx
  on public.backup_artifacts(integrity_verified, created_at);

grant select on public.backup_tasks to authenticated;

drop policy if exists "Admins view backup tasks" on public.backup_tasks;
create policy "Admins view backup tasks"
  on public.backup_tasks
  for select
  to authenticated
  using (public.has_role(auth.uid(),'admin'));
