create schema if not exists recovery;
revoke all on schema recovery from public, anon, authenticated;
grant usage on schema recovery to postgres, service_role;

create table if not exists recovery.categories_before_aug28_restore_20260830 as
select * from public.categories;

create table if not exists recovery.menu_items_before_aug28_restore_20260830 as
select * from public.menu_items;

create table if not exists recovery.product_categories_before_aug28_restore_20260830 as
select id, trier_product_id, category_id, category_name, manual_category, updated_at
from public.products;

revoke all on all tables in schema recovery from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema recovery to postgres, service_role;
