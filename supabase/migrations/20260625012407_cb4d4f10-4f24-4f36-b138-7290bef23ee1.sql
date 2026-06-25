DROP POLICY IF EXISTS "prescriptions_owner_insert" ON public.prescriptions;
CREATE POLICY "prescriptions_owner_insert" ON public.prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);