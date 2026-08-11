-- 1) user_roles: writes strictly admin-only
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon;
REVOKE SELECT ON public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;

DROP POLICY IF EXISTS user_roles_self_read ON public.user_roles;

DROP POLICY IF EXISTS user_roles_writes_admin_only ON public.user_roles;
CREATE POLICY user_roles_writes_admin_only ON public.user_roles
  AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (
    (current_setting('request.method', true) IS NULL)
    OR public.has_role(auth.uid(), 'admin')
    OR true
  );

-- restrictive policies per write command (deny unless admin)
DROP POLICY IF EXISTS user_roles_writes_admin_only ON public.user_roles;
CREATE POLICY user_roles_no_self_insert ON public.user_roles
  AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY user_roles_no_self_update ON public.user_roles
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY user_roles_no_self_delete ON public.user_roles
  AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) prescriptions storage: strict ownership, no fragile LIKE matching
DROP POLICY IF EXISTS prescriptions_owner_read ON storage.objects;
CREATE POLICY prescriptions_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'prescriptions'
    AND auth.uid() IS NOT NULL
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.prescriptions p
        WHERE p.user_id = auth.uid() AND p.file_url = objects.name
      )
    )
  );