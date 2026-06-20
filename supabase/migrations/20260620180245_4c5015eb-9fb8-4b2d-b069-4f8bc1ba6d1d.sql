
CREATE OR REPLACE FUNCTION public.admin_invite_seller(_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode convidar vendedores';
  END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found',
      'message', 'Usuário não encontrado. Peça para a pessoa criar conta primeiro em /auth com este email.');
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (uid, 'seller')
    ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.seller_permissions(user_id) VALUES (uid)
    ON CONFLICT (user_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'user_id', uid);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_revoke_seller(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode revogar vendedores';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'seller';
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_sellers()
RETURNS TABLE(user_id uuid, email text, full_name text, granted_at timestamptz,
              can_request_refund boolean, can_execute_refund boolean, can_view_prescriptions boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.user_id,
         u.email::text,
         p.full_name,
         u.created_at,
         COALESCE(sp.can_request_refund, true),
         COALESCE(sp.can_execute_refund, false),
         COALESCE(sp.can_view_prescriptions, false)
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.seller_permissions sp ON sp.user_id = ur.user_id
  WHERE ur.role = 'seller'
    AND public.has_role(auth.uid(), 'admin')
  ORDER BY u.created_at DESC;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='seller_permissions_user_id_key') THEN
    ALTER TABLE public.seller_permissions ADD CONSTRAINT seller_permissions_user_id_key UNIQUE (user_id);
  END IF;
END $$;
