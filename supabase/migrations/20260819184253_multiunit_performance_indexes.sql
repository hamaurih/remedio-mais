-- Multiunit performance indexes
-- Remove índice redundante em orders e adiciona lookup direto por filial nas reservas.

drop index if exists public.orders_store_fulfillment_idx;

create index if not exists order_inventory_reservations_store_id_idx
  on public.order_inventory_reservations(store_id);
