create table if not exists public.auth_login_attempts (
  key_hash text primary key,
  failures integer not null default 0 check (failures >= 0 and failures <= 1000),
  window_started_at timestamptz not null default now(),
  last_failed_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auth_login_attempts enable row level security;

revoke all on table public.auth_login_attempts from public, anon, authenticated;
grant select, insert, update, delete on table public.auth_login_attempts to service_role;

create index if not exists auth_login_attempts_locked_until_idx
  on public.auth_login_attempts (locked_until)
  where locked_until is not null;

comment on table public.auth_login_attempts is
  'Server-only brute-force protection. Stores only keyed hashes; never raw email, IP or password.';
