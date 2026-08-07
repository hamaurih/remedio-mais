-- 1) Explicit admin-only policies for the private database export bucket
DROP POLICY IF EXISTS "Admins manage database export files" ON storage.objects;
CREATE POLICY "Admins manage database export files"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'database_export_18_07_26' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'database_export_18_07_26' AND public.has_role(auth.uid(), 'admin'));

-- 2) Owner-scoped INSERT policy for prescriptions: authenticated users may upload
--    only inside their own folder (<uid>/...). Server-side (service_role) uploads unaffected.
DROP POLICY IF EXISTS "Users upload own prescription files" ON storage.objects;
CREATE POLICY "Users upload own prescription files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'prescriptions'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);