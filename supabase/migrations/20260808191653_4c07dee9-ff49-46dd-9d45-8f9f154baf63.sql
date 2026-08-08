-- 1) product_price_history: write access only via SECURITY DEFINER trigger
ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.product_price_history FROM anon, authenticated;
REVOKE SELECT ON public.product_price_history FROM anon;
GRANT SELECT ON public.product_price_history TO authenticated;
GRANT ALL ON public.product_price_history TO service_role;

-- 2) product_taxonomy: hide internal management columns from public readers
REVOKE SELECT ON public.product_taxonomy FROM anon, authenticated;
GRANT SELECT (id, product_id, department_id, category_id, subcategory_id, is_primary)
  ON public.product_taxonomy TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_taxonomy TO authenticated;
GRANT ALL ON public.product_taxonomy TO service_role;

-- restore full column visibility for admins through a definer helper view is not needed;
-- admins read internal columns through the admin-only RPCs / service role.

-- 3) refund_requests: only admins may change workflow status
CREATE OR REPLACE FUNCTION public.guard_refund_request_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / edge functions
  END IF;
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.status, 'pending') <> 'pending' THEN
      RAISE EXCEPTION 'Somente admin pode criar solicitação com status diferente de pendente';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.processed_by IS DISTINCT FROM OLD.processed_by
     OR NEW.processed_at IS DISTINCT FROM OLD.processed_at
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
    RAISE EXCEPTION 'Somente admin pode alterar o andamento do reembolso';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_refund_request_status ON public.refund_requests;
CREATE TRIGGER trg_guard_refund_request_status
BEFORE INSERT OR UPDATE ON public.refund_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_refund_request_status();