
-- Attach the variant sync triggers (functions already exist)
DROP TRIGGER IF EXISTS trg_sync_parent_has_variants ON public.product_variants;
CREATE TRIGGER trg_sync_parent_has_variants
AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.sync_parent_has_variants();

DROP TRIGGER IF EXISTS trg_sync_parent_stock_from_variants ON public.product_variants;
CREATE TRIGGER trg_sync_parent_stock_from_variants
AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.sync_parent_stock_from_variants();

-- Backfill: any product that has at least one active variant must reflect that
WITH agg AS (
  SELECT parent_product_id AS pid,
         COUNT(*) FILTER (WHERE active AND COALESCE(TRIM(variation_value),'') <> '') AS active_count,
         MIN(variation_type) FILTER (WHERE active AND COALESCE(TRIM(variation_value),'') <> '') AS first_type,
         COALESCE(SUM(stock) FILTER (WHERE active), 0)::int AS total_stock
  FROM public.product_variants
  GROUP BY parent_product_id
)
UPDATE public.products p
SET has_variants = (agg.active_count > 0),
    variation_type = CASE WHEN agg.active_count > 0 THEN COALESCE(agg.first_type, 'tamanho') ELSE NULL END,
    stock = CASE WHEN agg.active_count > 0 THEN agg.total_stock ELSE p.stock END
FROM agg
WHERE p.id = agg.pid;
