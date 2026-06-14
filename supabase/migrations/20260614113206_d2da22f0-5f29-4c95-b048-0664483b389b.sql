DROP POLICY IF EXISTS prescriptions_public_insert ON public.prescriptions;

CREATE POLICY prescriptions_anon_insert ON public.prescriptions
  FOR INSERT TO anon
  WITH CHECK (
    user_id IS NULL
    AND char_length(customer_name) BETWEEN 2 AND 120
    AND char_length(customer_phone) BETWEEN 8 AND 20
    AND (file_url IS NULL OR (char_length(file_url) <= 300 AND file_url ~ '^public/[0-9]+-[A-Za-z0-9._-]+$'))
    AND (notes IS NULL OR char_length(notes) <= 1000)
    AND status = 'recebida'
    AND internal_notes IS NULL
  );

CREATE POLICY prescriptions_authenticated_insert ON public.prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND char_length(customer_name) BETWEEN 2 AND 120
    AND char_length(customer_phone) BETWEEN 8 AND 20
    AND (file_url IS NULL OR (char_length(file_url) <= 300 AND file_url ~ '^public/[0-9]+-[A-Za-z0-9._-]+$'))
    AND (notes IS NULL OR char_length(notes) <= 1000)
    AND status = 'recebida'
    AND internal_notes IS NULL
  );