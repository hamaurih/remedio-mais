begin;

create temporary table safe_product_prefix_map (
  prefix text primary key,
  expanded text not null
) on commit drop;

insert into safe_product_prefix_map (prefix, expanded) values
  ('ESM','ESMALTE'), ('SH','SHAMPOO'), ('CR','CREME'),
  ('TIN','TINTURA'), ('SAB','SABONETE'), ('DES','DESODORANTE'),
  ('HID','HIDRATANTE'), ('MAM','MAMADEIRA'), ('ENX','ENXAGUANTE'),
  ('CUR','CURATIVO'), ('DEO','DESODORANTE'), ('ESP','ESPUMA'),
  ('REP','REPARADOR'), ('LOC','LOÇÃO'), ('ESF','ESFOLIANTE'),
  ('POM','POMADA'), ('SUP','SUPOSITÓRIO'), ('AG','AGULHA'),
  ('CD','CREME DENTAL'), ('OL','ÓLEO');

create table if not exists recovery.product_names_before_safe_prefix_expansion_20260902 (
  product_id uuid primary key,
  old_name text not null,
  new_name text not null,
  prefix text not null,
  old_manual_name boolean not null,
  old_updated_at timestamptz,
  backed_up_at timestamptz not null default now()
);

insert into recovery.product_names_before_safe_prefix_expansion_20260902 (
  product_id, old_name, new_name, prefix, old_manual_name, old_updated_at
)
select
  p.id,
  p.name,
  regexp_replace(p.name, '^[^[:space:]]+', m.expanded),
  m.prefix,
  coalesce(p.manual_name, false),
  p.updated_at
from public.products p
join safe_product_prefix_map m
  on upper(substring(p.name from '^([^[:space:]]+)')) = m.prefix
where not coalesce(p.manual_name, false)
on conflict (product_id) do nothing;

update public.products p
set
  name = b.new_name,
  manual_name = true,
  updated_at = now()
from recovery.product_names_before_safe_prefix_expansion_20260902 b
where p.id = b.product_id
  and p.name = b.old_name
  and not coalesce(p.manual_name, false);

commit;
