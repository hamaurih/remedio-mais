begin;

create table if not exists recovery.product_names_before_esc_dent_expansion_20260902 (
  product_id uuid primary key,
  old_name text not null,
  new_name text not null,
  old_manual_name boolean not null,
  old_updated_at timestamptz,
  backed_up_at timestamptz not null default now()
);

insert into recovery.product_names_before_esc_dent_expansion_20260902 (
  product_id, old_name, new_name, old_manual_name, old_updated_at
)
select
  id,
  name,
  regexp_replace(name, '^ESC[[:space:]]+DENT', 'ESCOVA DE DENTES', 'i'),
  coalesce(manual_name, false),
  updated_at
from public.products
where upper(name) ~ '^ESC[[:space:]]+DENT([^A-Z]|$)'
on conflict (product_id) do nothing;

update public.products p
set
  name = b.new_name,
  manual_name = true,
  updated_at = now()
from recovery.product_names_before_esc_dent_expansion_20260902 b
where p.id = b.product_id
  and p.name = b.old_name;

commit;
