
-- Saneamento Produtos × Trier: classificação de mapeamento, fonte da verdade e fechamento de jobs travados

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS mapping_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_origin text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS stock_origin text NOT NULL DEFAULT 'manual';

-- Domínios controlados via CHECK (estáveis, não dependentes de tempo)
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_mapping_status_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_mapping_status_check
  CHECK (mapping_status IN ('mapped','orphan','needs_review','unknown'));

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_price_origin_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_price_origin_check
  CHECK (price_origin IN ('trier','manual','locked'));

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_stock_origin_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_stock_origin_check
  CHECK (stock_origin IN ('trier','manual','locked'));

CREATE INDEX IF NOT EXISTS idx_products_mapping_status ON public.products(mapping_status);
CREATE INDEX IF NOT EXISTS idx_products_needs_review ON public.products(needs_review) WHERE needs_review;

-- View de saúde do catálogo (consumida pelo AdminTrier/AdminStock)
CREATE OR REPLACE VIEW public.products_health_summary AS
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE active) AS ativos,
  COUNT(*) FILTER (WHERE active AND stock > 0 AND price > 0) AS vendaveis,
  COUNT(*) FILTER (WHERE mapping_status='mapped') AS mapeados,
  COUNT(*) FILTER (WHERE mapping_status='orphan') AS orfaos,
  COUNT(*) FILTER (WHERE mapping_status='needs_review') AS revisar,
  COUNT(*) FILTER (WHERE needs_review) AS marcados_revisao,
  COUNT(*) FILTER (WHERE stock > 0) AS com_estoque,
  COUNT(*) FILTER (WHERE active AND (stock IS NULL OR stock<=0)) AS ativos_sem_estoque,
  COUNT(*) FILTER (WHERE active AND stock <= minimum_stock) AS estoque_baixo_ativos,
  COUNT(*) FILTER (WHERE price IS NULL OR price=0) AS sem_preco,
  COUNT(*) FILTER (WHERE promo_price IS NOT NULL) AS com_promo,
  COUNT(*) FILTER (WHERE source='trier') AS origem_trier,
  COUNT(*) FILTER (WHERE source='manual_import') AS origem_import,
  COUNT(*) FILTER (WHERE source='manual') AS origem_manual,
  COUNT(*) FILTER (WHERE trier_product_id IS NOT NULL) AS com_trier_id,
  COUNT(*) FILTER (WHERE barcode IS NOT NULL AND barcode<>'') AS com_barcode,
  COUNT(*) FILTER (WHERE last_trier_sync_at IS NOT NULL) AS ja_sincronizado,
  MAX(last_trier_sync_at) AS ultima_sync
FROM public.products;

ALTER VIEW public.products_health_summary SET (security_invoker = true);
GRANT SELECT ON public.products_health_summary TO authenticated;
