-- Multiunit store lookup indexes
-- Índices dos caminhos operacionais mais usados quando matriz/filiais entrarem em produção.

create index if not exists orders_store_id_idx
  on public.orders(store_id, created_at desc);

create index if not exists inventory_balances_store_id_idx
  on public.inventory_balances(store_id, available desc);

create index if not exists inventory_lots_store_id_idx
  on public.inventory_lots(store_id, product_id, expiry_date);

create index if not exists inventory_ledger_store_id_idx
  on public.inventory_ledger(store_id, created_at desc);

create index if not exists store_product_prices_store_id_idx
  on public.store_product_prices(store_id, product_id);
