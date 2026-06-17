-- Remove anon INSERT access to the prescriptions bucket; uploads now go via edge function (service role)
DROP POLICY IF EXISTS prescriptions_public_upload ON storage.objects;

-- Remove anon INSERT access to the prescriptions table; the edge function uses service role
DROP POLICY IF EXISTS prescriptions_anon_insert ON public.prescriptions;
DROP POLICY IF EXISTS prescriptions_authenticated_insert ON public.prescriptions;