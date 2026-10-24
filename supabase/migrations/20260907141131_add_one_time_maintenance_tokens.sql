create table if not exists public._maintenance_tokens (
  id uuid primary key default gen_random_uuid(),
  purpose text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public._maintenance_tokens enable row level security;
revoke all on table public._maintenance_tokens from anon, authenticated;
comment on table public._maintenance_tokens is 'One-time server maintenance tokens; service-role access only.';
