alter table public.store_settings
  add column if not exists prescription_email_notify boolean not null default false,
  add column if not exists prescription_email_to text;
