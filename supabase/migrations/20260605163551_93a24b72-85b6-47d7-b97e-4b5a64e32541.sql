-- 1) Trier settings: sync mode + emergency pause
ALTER TABLE public.trier_settings
  ADD COLUMN IF NOT EXISTS sync_mode TEXT NOT NULL DEFAULT 'safe_operational',
  ADD COLUMN IF NOT EXISTS auto_sync_paused BOOLEAN NOT NULL DEFAULT false;

-- 2) Products: manual override flags to protect commercial fields
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS manual_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_image BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_description BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_category BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_barcode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_name BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_seo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_shelves BOOLEAN NOT NULL DEFAULT false;

-- 3) Per-product sync history
CREATE TABLE IF NOT EXISTS public.product_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  trier_product_id TEXT,
  sync_type TEXT NOT NULL,
  fields_updated JSONB,
  fields_protected JSONB,
  old_values JSONB,
  new_values JSONB,
  status TEXT NOT NULL DEFAULT 'ok',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_sync_logs TO authenticated;
GRANT ALL ON public.product_sync_logs TO service_role;
ALTER TABLE public.product_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read product_sync_logs"
  ON public.product_sync_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_psl_product ON public.product_sync_logs(product_id, created_at DESC);

-- 4) Barcode divergences awaiting human review
CREATE TABLE IF NOT EXISTS public.trier_barcode_divergences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  trier_product_id TEXT,
  current_barcode TEXT,
  trier_barcode TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);
GRANT SELECT, UPDATE, DELETE ON public.trier_barcode_divergences TO authenticated;
GRANT ALL ON public.trier_barcode_divergences TO service_role;
ALTER TABLE public.trier_barcode_divergences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage barcode divergences"
  ON public.trier_barcode_divergences FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_bd_updated_at BEFORE UPDATE ON public.trier_barcode_divergences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();