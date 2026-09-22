create table if not exists public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (lower(regexp_replace(trim(name), '\\s+', ' ', 'g'))) stored,
  active boolean not null default true,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists manufacturers_normalized_name_unique on public.manufacturers(normalized_name);
alter table public.products add column if not exists manufacturer_id uuid references public.manufacturers(id);
create index if not exists products_manufacturer_idx on public.products(manufacturer_id);

alter table public.manufacturers enable row level security;
drop policy if exists manufacturers_public_read on public.manufacturers;
create policy manufacturers_public_read on public.manufacturers for select using (active = true);
drop policy if exists manufacturers_admin_write on public.manufacturers;
create policy manufacturers_admin_write on public.manufacturers for all to authenticated using (app_security.has_role(auth.uid(), 'admin'::app_role)) with check (app_security.has_role(auth.uid(), 'admin'::app_role));

insert into public.manufacturers (name, source)
select trim(p.laboratory), 'trier_migrated'
from public.products p
where nullif(trim(p.laboratory),'') is not null
group by trim(p.laboratory)
on conflict (normalized_name) do nothing;

update public.products p
set manufacturer_id = m.id
from public.manufacturers m
where p.manufacturer_id is null
and nullif(trim(p.laboratory),'') is not null
and m.normalized_name = lower(regexp_replace(trim(p.laboratory), '\\s+', ' ', 'g'));
