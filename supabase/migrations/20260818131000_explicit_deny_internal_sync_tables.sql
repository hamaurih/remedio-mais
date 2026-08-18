-- These tables are backend/service-role only. RLS with no policy already denied
-- client access; explicit deny policies document that intent and keep the linter clean.

drop policy if exists deny_client_trier_sales_rotation_items on public.trier_sales_rotation_items;
create policy deny_client_trier_sales_rotation_items
on public.trier_sales_rotation_items
for all to anon,authenticated
using (false)
with check (false);

drop policy if exists deny_client_trier_rotation_sync_state on public.trier_rotation_sync_state;
create policy deny_client_trier_rotation_sync_state
on public.trier_rotation_sync_state
for all to anon,authenticated
using (false)
with check (false);

drop policy if exists deny_client_trier_stock_sync_state on public.trier_stock_sync_state;
create policy deny_client_trier_stock_sync_state
on public.trier_stock_sync_state
for all to anon,authenticated
using (false)
with check (false);
