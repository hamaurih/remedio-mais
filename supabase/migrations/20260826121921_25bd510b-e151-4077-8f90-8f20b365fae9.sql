ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS prescription_email_notify boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prescription_email_to text;

UPDATE public.store_settings
  SET prescription_email_notify = true,
      prescription_email_to = COALESCE(NULLIF(prescription_email_to, ''), 'vagnervidal87@hotmail.com')
  WHERE id = 1;

CREATE TABLE IF NOT EXISTS public.prescription_email_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  status text NOT NULL,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS prescription_email_log_sent_unique
  ON public.prescription_email_log (prescription_id)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS prescription_email_log_created_at_idx
  ON public.prescription_email_log (created_at DESC);

GRANT SELECT ON public.prescription_email_log TO authenticated;
GRANT ALL ON public.prescription_email_log TO service_role;

ALTER TABLE public.prescription_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view prescription email log"
  ON public.prescription_email_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));