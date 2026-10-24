create index if not exists suppliers_tenant_active_name_idx on public.suppliers (tenant_id, active, legal_name);
create index if not exists supplier_products_supplier_product_idx on public.supplier_products (supplier_id, product_id);
create index if not exists purchase_orders_store_status_expected_idx on public.purchase_orders (store_id, status, expected_at);
create index if not exists purchase_order_items_order_product_idx on public.purchase_order_items (purchase_order_id, product_id);
create index if not exists goods_receipts_store_status_received_idx on public.goods_receipts (store_id, status, received_at desc);
create index if not exists goods_receipt_items_receipt_product_idx on public.goods_receipt_items (goods_receipt_id, product_id);
create unique index if not exists suppliers_tenant_cnpj_unique on public.suppliers (tenant_id, cnpj) where cnpj is not null;
