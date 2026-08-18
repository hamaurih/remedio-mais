-- Seller operational alerts: paid orders + prescriptions awaiting review.
-- Notifications are fanned out per seller so existing target_user_id RLS remains strict.

ALTER TABLE public.seller_permissions
  ADD COLUMN IF NOT EXISTS can_approve_prescriptions boolean NOT NULL DEFAULT false;

-- Keep the admin seller-management RPC in sync with the new permission.
DROP FUNCTION IF EXISTS public.admin_list_sellers();
CREATE FUNCTION public.admin_list_sellers()
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  granted_at timestamptz,
  can_request_refund boolean,
  can_execute_refund boolean,
  can_view_prescriptions boolean,
  can_approve_prescriptions boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ur.user_id,
         u.email::text,
         p.full_name,
         u.created_at,
         COALESCE(sp.can_request_refund, true),
         COALESCE(sp.can_execute_refund, false),
         COALESCE(sp.can_view_prescriptions, false),
         COALESCE(sp.can_approve_prescriptions, false)
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.seller_permissions sp ON sp.user_id = ur.user_id
  WHERE ur.role = 'seller'
    AND public.has_role(auth.uid(), 'admin')
  ORDER BY u.created_at DESC;
$function$;
REVOKE ALL ON FUNCTION public.admin_list_sellers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_sellers() TO authenticated;

-- Approved timestamp must stay consistent regardless of whether admin or seller reviews it.
CREATE OR REPLACE FUNCTION public.sync_prescription_approved_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'aprovada' THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_prescription_approved_at ON public.prescriptions;
CREATE TRIGGER trg_sync_prescription_approved_at
BEFORE UPDATE OF status ON public.prescriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_prescription_approved_at();

-- A new prescription creates one admin notification. It intentionally carries no clinical data.
CREATE OR REPLACE FUNCTION public.notify_new_prescription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.admin_notifications(
    type, title, message, priority, role_target, metadata
  ) VALUES (
    'prescription_received',
    'Nova receita recebida',
    'Uma nova receita está aguardando análise e aprovação.',
    'high',
    'admin',
    jsonb_build_object('prescription_id', NEW.id)
  );
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.notify_new_prescription() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_new_prescription ON public.prescriptions;
CREATE TRIGGER trg_notify_new_prescription
AFTER INSERT ON public.prescriptions
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_prescription();

-- Every paid-order notification is copied to every seller.
-- Prescription notifications are copied only to sellers explicitly allowed to approve them.
CREATE OR REPLACE FUNCTION public.fanout_operational_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role_target <> 'admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'order_paid' THEN
    INSERT INTO public.admin_notifications(
      type, title, message, order_id, read, priority, role_target,
      target_user_id, metadata
    )
    SELECT
      'order_paid',
      'Venda confirmada!',
      COALESCE(NEW.message, 'Uma nova venda foi confirmada no site.'),
      NEW.order_id,
      false,
      'high',
      'seller',
      ur.user_id,
      COALESCE(NEW.metadata, '{}'::jsonb)
    FROM public.user_roles ur
    WHERE ur.role = 'seller';

  ELSIF NEW.type = 'prescription_received' THEN
    INSERT INTO public.admin_notifications(
      type, title, message, order_id, read, priority, role_target,
      target_user_id, metadata
    )
    SELECT
      'prescription_received',
      'Receita aguardando aprovação!',
      'Uma nova receita foi enviada. Abra a fila para analisar e aprovar.',
      NULL,
      false,
      'high',
      'seller',
      ur.user_id,
      COALESCE(NEW.metadata, '{}'::jsonb)
    FROM public.user_roles ur
    JOIN public.seller_permissions sp ON sp.user_id = ur.user_id
    WHERE ur.role = 'seller'
      AND sp.can_approve_prescriptions = true;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fanout_operational_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fanout_operational_notification ON public.admin_notifications;
CREATE TRIGGER trg_fanout_operational_notification
AFTER INSERT ON public.admin_notifications
FOR EACH ROW
EXECUTE FUNCTION public.fanout_operational_notification();

-- Sellers with approval permission must be able to read the prescription they were alerted about.
DROP POLICY IF EXISTS "Sellers with permission can read prescriptions" ON public.prescriptions;
CREATE POLICY "Sellers with permission can read prescriptions"
ON public.prescriptions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'seller'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.seller_permissions sp
    WHERE sp.user_id = auth.uid()
      AND (sp.can_view_prescriptions = true OR sp.can_approve_prescriptions = true)
  )
);

-- Approval happens through a narrow RPC instead of broad seller UPDATE access to prescriptions.
CREATE OR REPLACE FUNCTION public.seller_review_prescription(
  _prescription_id uuid,
  _status text,
  _internal_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  allowed boolean := false;
  result_row public.prescriptions%ROWTYPE;
BEGIN
  IF _status NOT IN ('recebida', 'em_analise', 'aprovada', 'recusada', 'finalizada') THEN
    RAISE EXCEPTION 'Status de receita inválido';
  END IF;

  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    allowed := true;
  ELSIF public.has_role(auth.uid(), 'seller'::app_role) THEN
    SELECT COALESCE(sp.can_approve_prescriptions, false)
      INTO allowed
    FROM public.seller_permissions sp
    WHERE sp.user_id = auth.uid();
  END IF;

  IF NOT COALESCE(allowed, false) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar receitas';
  END IF;

  UPDATE public.prescriptions
  SET status = _status,
      internal_notes = CASE
        WHEN _internal_notes IS NULL THEN internal_notes
        ELSE _internal_notes
      END
  WHERE id = _prescription_id
  RETURNING * INTO result_row;

  IF result_row.id IS NULL THEN
    RAISE EXCEPTION 'Receita não encontrada';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', result_row.id,
    'status', result_row.status,
    'approved_at', result_row.approved_at
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.seller_review_prescription(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_review_prescription(uuid, text, text) TO authenticated;

-- Current operational seller accounts are expected to handle the prescription queue.
INSERT INTO public.seller_permissions(
  user_id, can_view_prescriptions, can_approve_prescriptions
)
SELECT u.id, true, true
FROM auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'seller'
WHERE lower(u.email) IN (
  'vendedor01@atacadaodosmedicamentos.com',
  'vendedor02@atacadaodosmedicamentos.com'
)
ON CONFLICT (user_id) DO UPDATE
SET can_view_prescriptions = true,
    can_approve_prescriptions = true,
    updated_at = now();
