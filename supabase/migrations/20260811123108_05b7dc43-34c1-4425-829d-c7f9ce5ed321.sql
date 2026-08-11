CREATE TABLE public.marketing_settings (
  id integer PRIMARY KEY DEFAULT 1,
  meta_enabled boolean NOT NULL DEFAULT false,
  meta_pixel_id text,
  meta_test_event_code text,
  meta_capi_enabled boolean NOT NULL DEFAULT false,
  meta_consent_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_settings_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.marketing_settings TO authenticated;
GRANT ALL ON public.marketing_settings TO service_role;

ALTER TABLE public.marketing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage marketing settings"
ON public.marketing_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER marketing_settings_touch
BEFORE UPDATE ON public.marketing_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.marketing_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Config pública mínima (sem test_event_code, sem token): só o necessário para o Pixel do site.
CREATE OR REPLACE FUNCTION public.public_meta_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'enabled', COALESCE(m.meta_enabled, false),
    'pixel_id', CASE WHEN COALESCE(m.meta_enabled, false) THEN m.meta_pixel_id ELSE NULL END,
    'consent_required', COALESCE(m.meta_consent_required, false)
  )
  FROM public.marketing_settings m
  WHERE m.id = 1
$$;

GRANT EXECUTE ON FUNCTION public.public_meta_config() TO anon, authenticated;

CREATE TABLE public.meta_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_id text NOT NULL UNIQUE,
  order_id uuid,
  product_id uuid,
  source text NOT NULL DEFAULT 'server',
  status text NOT NULL DEFAULT 'pending',
  http_status integer,
  response_masked text,
  test_mode boolean NOT NULL DEFAULT false,
  value numeric,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT meta_event_logs_source_check CHECK (source IN ('browser','server','admin_test')),
  CONSTRAINT meta_event_logs_status_check CHECK (status IN ('pending','sent','error','skipped'))
);

CREATE INDEX idx_meta_event_logs_created_at ON public.meta_event_logs (created_at DESC);
CREATE INDEX idx_meta_event_logs_event_name ON public.meta_event_logs (event_name, created_at DESC);
CREATE INDEX idx_meta_event_logs_order ON public.meta_event_logs (order_id);

GRANT SELECT ON public.meta_event_logs TO authenticated;
GRANT ALL ON public.meta_event_logs TO service_role;

ALTER TABLE public.meta_event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read meta event logs"
ON public.meta_event_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS meta_fbp text,
  ADD COLUMN IF NOT EXISTS meta_fbc text,
  ADD COLUMN IF NOT EXISTS meta_purchase_event_id text,
  ADD COLUMN IF NOT EXISTS meta_purchase_sent_at timestamptz;