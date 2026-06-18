CREATE TABLE IF NOT EXISTS public.payment_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  stage text NOT NULL,
  error_code text,
  message text,
  mp_error jsonb,
  supabase_error jsonb,
  payload_summary jsonb,
  http_status int,
  order_id uuid,
  user_id uuid,
  user_email text
);

GRANT SELECT ON public.payment_errors TO authenticated;
GRANT ALL ON public.payment_errors TO service_role;

ALTER TABLE public.payment_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_errors_admin_select"
  ON public.payment_errors FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS payment_errors_created_at_idx ON public.payment_errors (created_at DESC);