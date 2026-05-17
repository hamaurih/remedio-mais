
-- =========================================================
-- TRIER SETTINGS (singleton, id=1)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.trier_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  environment TEXT NOT NULL DEFAULT 'homologacao',
  base_url TEXT NOT NULL DEFAULT 'https://homologacao.triersistemas.com.br/sgfpod1',
  bearer_token TEXT,
  branch_code TEXT,
  page_size INTEGER NOT NULL DEFAULT 100,
  ecommerce_filter_enabled BOOLEAN NOT NULL DEFAULT true,
  sync_products_enabled BOOLEAN NOT NULL DEFAULT false,
  sync_categories_enabled BOOLEAN NOT NULL DEFAULT false,
  sync_stock_enabled BOOLEAN NOT NULL DEFAULT false,
  sync_prices_enabled BOOLEAN NOT NULL DEFAULT false,
  sync_discounts_enabled BOOLEAN NOT NULL DEFAULT false,
  send_orders_enabled BOOLEAN NOT NULL DEFAULT false,
  check_order_status_enabled BOOLEAN NOT NULL DEFAULT false,
  schedule_products_minutes INTEGER NOT NULL DEFAULT 360,
  schedule_stock_minutes INTEGER NOT NULL DEFAULT 15,
  schedule_prices_minutes INTEGER NOT NULL DEFAULT 60,
  schedule_discounts_minutes INTEGER NOT NULL DEFAULT 60,
  last_connection_test_at TIMESTAMPTZ,
  last_connection_status TEXT,
  last_sync_products_at TIMESTAMPTZ,
  last_sync_categories_at TIMESTAMPTZ,
  last_sync_stock_at TIMESTAMPTZ,
  last_sync_prices_at TIMESTAMPTZ,
  last_sync_discounts_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.trier_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.trier_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trier_settings_admin_all" ON public.trier_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trier_settings_touch BEFORE UPDATE ON public.trier_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- TRIER PRODUCT MAPPINGS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.trier_product_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  trier_product_id TEXT NOT NULL UNIQUE,
  trier_barcode TEXT,
  trier_name TEXT,
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'ok',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mappings_product ON public.trier_product_mappings(product_id);

ALTER TABLE public.trier_product_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trier_mappings_admin_all" ON public.trier_product_mappings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trier_mappings_touch BEFORE UPDATE ON public.trier_product_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- TRIER SYNC JOBS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.trier_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  trigger TEXT NOT NULL DEFAULT 'manual',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  records_checked INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_ignored INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_type_started ON public.trier_sync_jobs(sync_type, started_at DESC);

ALTER TABLE public.trier_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trier_jobs_admin_all" ON public.trier_sync_jobs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- TRIER LOGS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.trier_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  details JSONB,
  product_id UUID,
  order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trier_logs_created ON public.trier_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trier_logs_type ON public.trier_logs(type);

ALTER TABLE public.trier_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trier_logs2_admin_all" ON public.trier_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- PRODUCTS additions
-- =========================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS trier_barcode TEXT,
  ADD COLUMN IF NOT EXISTS sync_with_trier BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lock_manual_price BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_manual_stock BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_trier_sync_at TIMESTAMPTZ;

-- =========================================================
-- ORDERS additions
-- =========================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS trier_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trier_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trier_status TEXT,
  ADD COLUMN IF NOT EXISTS trier_status_code INTEGER,
  ADD COLUMN IF NOT EXISTS trier_numero_nota TEXT,
  ADD COLUMN IF NOT EXISTS trier_last_status_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trier_error_message TEXT;

-- =========================================================
-- Remove old hourly cron job if exists
-- =========================================================
DO $$
BEGIN
  PERFORM cron.unschedule('trier-sync-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
