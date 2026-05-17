
-- Add Trier integration columns to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS trier_product_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS ecommerce_name TEXT,
  ADD COLUMN IF NOT EXISTS laboratory_code TEXT,
  ADD COLUMN IF NOT EXISTS laboratory TEXT,
  ADD COLUMN IF NOT EXISTS group_code TEXT,
  ADD COLUMN IF NOT EXISTS group_name TEXT,
  ADD COLUMN IF NOT EXISTS category_external_id TEXT,
  ADD COLUMN IF NOT EXISTS category_name TEXT,
  ADD COLUMN IF NOT EXISTS department_external_id TEXT,
  ADD COLUMN IF NOT EXISTS department_name TEXT,
  ADD COLUMN IF NOT EXISTS active_ingredient_code TEXT,
  ADD COLUMN IF NOT EXISTS ecommerce_price NUMERIC,
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS ecommerce_stock_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
  ADD COLUMN IF NOT EXISTS ecommerce_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_discount_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS sale_observation TEXT,
  ADD COLUMN IF NOT EXISTS medicine_list_type TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT,
  ADD COLUMN IF NOT EXISTS cart_quantity_limit INTEGER,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_products_trier_id ON public.products(trier_product_id);

-- Sync log table
CREATE TABLE IF NOT EXISTS public.trier_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  trigger TEXT NOT NULL DEFAULT 'manual',
  items_fetched INTEGER DEFAULT 0,
  items_created INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  details JSONB
);

ALTER TABLE public.trier_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trier_logs_admin_read" ON public.trier_sync_logs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "trier_logs_admin_all" ON public.trier_sync_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable cron + http for scheduled sync
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
