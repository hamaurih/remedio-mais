
-- 1) Revoke sensitive product columns from anon and authenticated; admins keep access via service role / has_role checks in app
REVOKE SELECT (
  stock_quantity, trier_stock_quantity, ecommerce_stock_quantity,
  max_discount_percentage, trier_barcode, ecommerce_price, ecommerce_enabled,
  mapping_status, price_origin, stock_origin, lock_manual_price,
  lock_manual_stock, sync_with_trier, minimum_stock
) ON public.products FROM anon, authenticated;

-- Ensure admins still get full select via service_role (edge functions/admin UI uses authenticated + admin role; re-grant per non-sensitive columns implicit via existing GRANT SELECT)
GRANT ALL ON public.products TO service_role;

-- 2) Reinforce seller update guard - drop and recreate trigger to ensure it's active
DROP TRIGGER IF EXISTS trg_guard_seller_order_update ON public.orders;
CREATE TRIGGER trg_guard_seller_order_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_order_update();

DROP TRIGGER IF EXISTS trg_guard_seller_order_item_update ON public.order_items;
CREATE TRIGGER trg_guard_seller_order_item_update
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_order_item_update();
