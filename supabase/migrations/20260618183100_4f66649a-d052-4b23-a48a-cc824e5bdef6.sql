
-- Split trigger: BEFORE UPDATE keeps mutating NEW (paid_at, cancelled_at);
-- AFTER INSERT logs the creation event once the orders row actually exists.

DROP TRIGGER IF EXISTS trg_orders_log_status ON public.orders;

CREATE OR REPLACE FUNCTION public.log_order_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
    INSERT INTO public.order_events(order_id, type, old_status, new_status, created_by)
    VALUES (NEW.id, 'order_status', OLD.order_status, NEW.order_status, uid);
  END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    INSERT INTO public.order_events(order_id, type, old_status, new_status, created_by)
    VALUES (NEW.id, 'payment_status', OLD.payment_status, NEW.payment_status, uid);
    IF NEW.payment_status = 'approved' AND NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
  END IF;
  IF NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status THEN
    INSERT INTO public.order_events(order_id, type, old_status, new_status, created_by)
    VALUES (NEW.id, 'fulfillment_status', OLD.fulfillment_status, NEW.fulfillment_status, uid);
  END IF;
  IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status THEN
    INSERT INTO public.order_events(order_id, type, old_status, new_status, created_by)
    VALUES (NEW.id, 'delivery_status', OLD.delivery_status, NEW.delivery_status, uid);
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'cancelado' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_order_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  INSERT INTO public.order_events(order_id, type, new_status, message, created_by)
  VALUES (NEW.id, 'created', NEW.order_status, 'Pedido criado', uid);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orders_log_update
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_status_update();

CREATE TRIGGER trg_orders_log_created
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_created();
