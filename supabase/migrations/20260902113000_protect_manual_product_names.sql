begin;

create schema if not exists recovery;

create table if not exists recovery.product_names_before_fr_abs_normalization_20260902 (
  product_id uuid primary key,
  old_name text not null,
  old_manual_name boolean not null,
  old_updated_at timestamptz,
  backed_up_at timestamptz not null default now()
);

insert into recovery.product_names_before_fr_abs_normalization_20260902 (
  product_id,
  old_name,
  old_manual_name,
  old_updated_at
)
select
  id,
  name,
  coalesce(manual_name, false),
  updated_at
from public.products
where upper(name) ~ '^(FR|ABS)([^A-Z]|$)'
on conflict (product_id) do nothing;

update public.products
set
  name = case
    when upper(name) ~ '^FR([^A-Z]|$)'
      then regexp_replace(name, '^FR([[:space:]]*)', 'Fralda ', 'i')
    when upper(name) ~ '^ABS([^A-Z]|$)'
      then regexp_replace(name, '^ABS([[:space:]]*)', 'Absorvente ', 'i')
    else name
  end,
  manual_name = true,
  updated_at = now()
where upper(name) ~ '^(FR|ABS)([^A-Z]|$)';

commit;
