create index if not exists inventory_balances_store_product_idx on public.inventory_balances (store_id, product_id);
create index if not exists inventory_ledger_store_product_created_idx on public.inventory_ledger (store_id, product_id, created_at desc);
create index if not exists inventory_ledger_lot_created_idx on public.inventory_ledger (lot_id, created_at desc) where lot_id is not null;
create index if not exists inventory_lots_store_expiry_idx on public.inventory_lots (store_id, expiry_date) where active = true;
create index if not exists inventory_transfers_status_idx on public.inventory_transfers (tenant_id, status, updated_at desc);
create index if not exists order_inventory_reservations_active_idx on public.order_inventory_reservations (store_id, product_id, status, expires_at) where status = 'active';
create unique index if not exists inventory_balances_store_product_unique on public.inventory_balances (store_id, product_id);
create unique index if not exists inventory_lots_store_product_batch_unique on public.inventory_lots (store_id, product_id, batch_number);
