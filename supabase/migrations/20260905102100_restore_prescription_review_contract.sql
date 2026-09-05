-- Restore the database contract used by the seller/admin prescription UI after migration drift.

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
SET search_path TO ''
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
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  ORDER BY u.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_sellers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_sellers() TO authenticated;

CREATE OR REPLACE FUNCTION public.seller_review_prescription(
  _prescription_id uuid,
  _status text,
  _internal_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  allowed boolean := false;
  result_row public.prescriptions%ROWTYPE;
BEGIN
  IF _status NOT IN ('recebida', 'em_analise', 'aprovada', 'recusada', 'finalizada') THEN
    RAISE EXCEPTION 'Status de receita inválido';
  END IF;

  SELECT * INTO result_row
  FROM public.prescriptions
  WHERE id = _prescription_id;

  IF result_row.id IS NULL THEN
    RAISE EXCEPTION 'Receita não encontrada';
  END IF;

  IF public.is_platform_staff(auth.uid()) THEN
    allowed := true;
  ELSIF result_row.tenant_id IS NOT NULL AND private.has_tenant_role(
    result_row.tenant_id,
    auth.uid(),
    ARRAY['owner','admin','manager','pharmacist']::text[]
  ) THEN
    allowed := true;
  ELSIF result_row.tenant_id IS NOT NULL AND private.has_tenant_role(
    result_row.tenant_id,
    auth.uid(),
    ARRAY['seller']::text[]
  ) THEN
    SELECT COALESCE(sp.can_approve_prescriptions, false)
      INTO allowed
    FROM public.seller_permissions sp
    WHERE sp.user_id = auth.uid();
  ELSIF result_row.tenant_id IS NULL AND public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    allowed := true;
  END IF;

  IF NOT COALESCE(allowed, false) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar receitas';
  END IF;

  UPDATE public.prescriptions
  SET status = _status,
      internal_notes = CASE WHEN _internal_notes IS NULL THEN internal_notes ELSE _internal_notes END
  WHERE id = _prescription_id
  RETURNING * INTO result_row;

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
