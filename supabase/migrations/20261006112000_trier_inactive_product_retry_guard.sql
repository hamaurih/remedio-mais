-- Evita retentativa infinita e spam de notificações quando a Trier rejeita
-- um pedido por conter produto inativo. O pedido fica preservado para revisão
-- operacional (substituição/estorno) e pode ser reabilitado depois.

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY order_id, type ORDER BY created_at DESC, id DESC) AS rn
  FROM public.admin_notifications
  WHERE read = false
    AND order_id IS NOT NULL
    AND type = 'trier_order_failed'
)
UPDATE public.admin_notifications n
SET read = true, read_at = now()
FROM ranked r
WHERE n.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_one_pending_trier_failure_per_order
ON public.admin_notifications (order_id, type)
WHERE read = false AND order_id IS NOT NULL AND type = 'trier_order_failed';

CREATE OR REPLACE FUNCTION public.block_trier_inactive_product_retry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  body_text text := lower(coalesce(NEW.response_payload_masked::text, ''));
BEGIN
  IF NEW.status = 'error'
     AND NEW.http_status = 400
     AND (body_text LIKE '%produto está inativo%' OR body_text LIKE '%produto esta inativo%') THEN
    UPDATE public.orders
       SET trier_eligible = false,
           trier_status = 'blocked_product_inactive',
           trier_status_code = 400,
           trier_last_error = 'Trier recusou o pedido porque existe produto inativo. Requer revisão do item antes de novo envio.',
           trier_error_message = 'Trier recusou o pedido porque existe produto inativo. Requer revisão do item antes de novo envio.',
           trier_sending_at = null
     WHERE id = NEW.order_id
       AND trier_sent = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_trier_inactive_product_retry ON public.trier_order_logs;
CREATE TRIGGER trg_block_trier_inactive_product_retry
AFTER INSERT ON public.trier_order_logs
FOR EACH ROW
EXECUTE FUNCTION public.block_trier_inactive_product_retry();

REVOKE ALL ON FUNCTION public.block_trier_inactive_product_retry() FROM PUBLIC, anon, authenticated;
