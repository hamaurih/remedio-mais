
-- 1) Trigger de auditoria em orders
CREATE OR REPLACE FUNCTION public.audit_order_sensitive_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_email text;
  changed jsonb := '{}'::jsonb;
BEGIN
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT email::text INTO actor_email FROM auth.users WHERE id = actor;

  IF NEW.total IS DISTINCT FROM OLD.total THEN changed := changed || jsonb_build_object('total', jsonb_build_array(OLD.total, NEW.total)); END IF;
  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal THEN changed := changed || jsonb_build_object('subtotal', jsonb_build_array(OLD.subtotal, NEW.subtotal)); END IF;
  IF NEW.discount IS DISTINCT FROM OLD.discount THEN changed := changed || jsonb_build_object('discount', jsonb_build_array(OLD.discount, NEW.discount)); END IF;
  IF NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee THEN changed := changed || jsonb_build_object('delivery_fee', jsonb_build_array(OLD.delivery_fee, NEW.delivery_fee)); END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN changed := changed || jsonb_build_object('payment_status', jsonb_build_array(OLD.payment_status, NEW.payment_status)); END IF;
  IF NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN changed := changed || jsonb_build_object('payment_method', jsonb_build_array(OLD.payment_method, NEW.payment_method)); END IF;
  IF NEW.payment_gateway IS DISTINCT FROM OLD.payment_gateway THEN changed := changed || jsonb_build_object('payment_gateway', jsonb_build_array(OLD.payment_gateway, NEW.payment_gateway)); END IF;
  IF NEW.mercado_pago_payment_id IS DISTINCT FROM OLD.mercado_pago_payment_id THEN changed := changed || jsonb_build_object('mercado_pago_payment_id', jsonb_build_array(OLD.mercado_pago_payment_id, NEW.mercado_pago_payment_id)); END IF;
  IF NEW.customer_cpf IS DISTINCT FROM OLD.customer_cpf THEN changed := changed || jsonb_build_object('customer_cpf_changed', true); END IF;
  IF NEW.trier_numero_nota IS DISTINCT FROM OLD.trier_numero_nota THEN changed := changed || jsonb_build_object('trier_numero_nota', jsonb_build_array(OLD.trier_numero_nota, NEW.trier_numero_nota)); END IF;
  IF NEW.trier_sent IS DISTINCT FROM OLD.trier_sent THEN changed := changed || jsonb_build_object('trier_sent', jsonb_build_array(OLD.trier_sent, NEW.trier_sent)); END IF;

  IF changed <> '{}'::jsonb THEN
    INSERT INTO public.admin_audit_log(actor_id, actor_email, action, entity_type, entity_id, before, after, metadata)
    VALUES (actor, actor_email, 'order.update_sensitive', 'order', NEW.id::text,
            jsonb_build_object('changed_keys', (SELECT jsonb_agg(k) FROM jsonb_object_keys(changed) k)),
            changed,
            jsonb_build_object('order_status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_orders_sensitive ON public.orders;
CREATE TRIGGER audit_orders_sensitive
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_order_sensitive_change();

-- 2) Vendedor pode ler order_events (histórico)
DROP POLICY IF EXISTS "Sellers read order_events" ON public.order_events;
CREATE POLICY "Sellers read order_events"
  ON public.order_events FOR SELECT
  USING (public.has_role(auth.uid(), 'seller'));

-- 3) Realtime para admin_notifications e orders
ALTER TABLE public.admin_notifications REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
