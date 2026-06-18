
-- 1) payment_events: explicit service_role INSERT policy + revoke anon/auth INSERT
CREATE POLICY payment_events_service_insert
  ON public.payment_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

REVOKE INSERT ON public.payment_events FROM anon, authenticated;
GRANT INSERT ON public.payment_events TO service_role;

-- 2) prescriptions: revoke anon INSERT (edge function uses service_role)
REVOKE INSERT ON public.prescriptions FROM anon;
GRANT INSERT ON public.prescriptions TO service_role;
