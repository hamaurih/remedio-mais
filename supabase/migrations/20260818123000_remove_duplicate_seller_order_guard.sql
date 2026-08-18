-- Keep a single seller order-update guard trigger.
-- Both triggers called public.guard_seller_order_update(), causing the same validation twice.
DROP TRIGGER IF EXISTS guard_seller_order_update_trg ON public.orders;
