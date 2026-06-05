ALTER TABLE public.trier_settings
  ADD COLUMN IF NOT EXISTS stock_source text NOT NULL DEFAULT 'loja';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trier_settings_stock_source_chk'
  ) THEN
    ALTER TABLE public.trier_settings
      ADD CONSTRAINT trier_settings_stock_source_chk
      CHECK (stock_source IN ('loja','ecommerce','auto'));
  END IF;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS trier_stock_quantity integer,
  ADD COLUMN IF NOT EXISTS ecommerce_stock_quantity integer,
  ADD COLUMN IF NOT EXISTS last_stock_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trier_active boolean;