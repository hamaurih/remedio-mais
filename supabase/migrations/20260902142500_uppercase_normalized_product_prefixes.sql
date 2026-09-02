begin;

create table if not exists recovery.product_names_before_uppercase_fix_20260902 (
  product_id uuid primary key,
  old_name text not null,
  old_updated_at timestamptz,
  backed_up_at timestamptz not null default now()
);

insert into recovery.product_names_before_uppercase_fix_20260902 (
  product_id,
  old_name,
  old_updated_at
)
select
  id,
  name,
  updated_at
from public.products
where name ~ '^(Fralda|Absorvente)([^A-Za-z]|$)'
on conflict (product_id) do nothing;

update public.products
set
  name = case
    when name ~ '^Fralda([^A-Za-z]|$)'
      then regexp_replace(name, '^Fralda', 'FRALDA')
    when name ~ '^Absorvente([^A-Za-z]|$)'
      then regexp_replace(name, '^Absorvente', 'ABSORVENTE')
    else name
  end,
  manual_name = true,
  updated_at = now()
where name ~ '^(Fralda|Absorvente)([^A-Za-z]|$)';

commit;
