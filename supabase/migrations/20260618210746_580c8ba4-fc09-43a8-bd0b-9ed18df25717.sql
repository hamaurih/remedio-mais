
-- 1) Remove client INSERT on orders (only checkout edge function/service_role inserts)
DROP POLICY IF EXISTS orders_authenticated_insert ON public.orders;
REVOKE INSERT ON public.orders FROM anon, authenticated;
GRANT INSERT ON public.orders TO service_role;

-- 2) Remove client INSERT on order_items
DROP POLICY IF EXISTS order_items_owner_insert ON public.order_items;
REVOKE INSERT ON public.order_items FROM anon, authenticated;
GRANT INSERT ON public.order_items TO service_role;

-- 3) Remove client INSERT on prescriptions (submit-prescription edge function only)
DROP POLICY IF EXISTS prescriptions_owner_insert ON public.prescriptions;
REVOKE INSERT ON public.prescriptions FROM anon, authenticated;
GRANT INSERT ON public.prescriptions TO service_role;

-- 4) Revoke internal/ERP columns on products from anon (storefront uses `stock`, not `stock_quantity`)
REVOKE SELECT (
  stock_quantity,
  trier_stock_quantity,
  ecommerce_stock_quantity,
  max_discount_percentage,
  trier_barcode,
  ecommerce_price,
  ecommerce_enabled,
  mapping_status,
  price_origin,
  stock_origin,
  lock_manual_price,
  lock_manual_stock,
  sync_with_trier,
  minimum_stock
) ON public.products FROM anon;
