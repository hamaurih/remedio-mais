create table if not exists public.prescription_email_log (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  recipient text not null,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

alter table public.prescription_email_log enable row level security;
revoke all on public.prescription_email_log from public, anon, authenticated;
grant select, insert, update, delete on public.prescription_email_log to service_role;

comment on table public.prescription_email_log is 'Historical and backend-only audit log for prescription email delivery attempts.';
