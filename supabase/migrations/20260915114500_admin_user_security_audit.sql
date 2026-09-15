create table if not exists public.admin_user_security_audit (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  target_user_id uuid not null,
  action text not null check (action in ('set_password','send_reset_link')),
  created_at timestamptz not null default now()
);

create index if not exists admin_user_security_audit_created_at_idx
  on public.admin_user_security_audit (created_at desc);

create index if not exists admin_user_security_audit_target_idx
  on public.admin_user_security_audit (target_user_id, created_at desc);

alter table public.admin_user_security_audit enable row level security;

revoke all on public.admin_user_security_audit from anon;
grant select on public.admin_user_security_audit to authenticated;
grant all on public.admin_user_security_audit to service_role;

drop policy if exists "Admins can view user security audit" on public.admin_user_security_audit;
create policy "Admins can view user security audit"
  on public.admin_user_security_audit
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
