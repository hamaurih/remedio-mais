CREATE POLICY "prescriptions_owner_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND EXISTS (
    SELECT 1 FROM public.prescriptions p
    WHERE p.file_url = storage.objects.name
      AND p.user_id = auth.uid()
  )
);