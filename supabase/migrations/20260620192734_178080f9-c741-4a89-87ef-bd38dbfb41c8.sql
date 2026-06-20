
-- Explicit admin-only write policies for the prescriptions storage bucket.
-- Client uploads go through the submit-prescription edge function (service role),
-- so no client INSERT/UPDATE/DELETE policy is required for that flow.
CREATE POLICY "prescriptions_admin_write_all"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'prescriptions' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'prescriptions' AND public.has_role(auth.uid(), 'admin'));

-- Sellers with can_view_prescriptions may read prescriptions.
CREATE POLICY "Sellers with permission can read prescriptions"
ON public.prescriptions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'seller')
  AND EXISTS (
    SELECT 1 FROM public.seller_permissions sp
    WHERE sp.user_id = auth.uid() AND sp.can_view_prescriptions = true
  )
);

-- Same for prescription files in storage when seller has permission.
CREATE POLICY "prescriptions_seller_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND public.has_role(auth.uid(), 'seller')
  AND EXISTS (
    SELECT 1 FROM public.seller_permissions sp
    WHERE sp.user_id = auth.uid() AND sp.can_view_prescriptions = true
  )
);
