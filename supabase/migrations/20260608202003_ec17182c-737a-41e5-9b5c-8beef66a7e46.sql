CREATE OR REPLACE FUNCTION public.sync_parent_stock_from_variants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  total int;
BEGIN
  pid := COALESCE(NEW.parent_product_id, OLD.parent_product_id);
  IF pid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(stock), 0)::int INTO total
  FROM public.product_variants
  WHERE parent_product_id = pid AND active = true;

  UPDATE public.products
  SET stock = total,
      has_variants = EXISTS (SELECT 1 FROM public.product_variants WHERE parent_product_id = pid)
  WHERE id = pid;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_parent_stock_from_variants() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_variants_sync_parent ON public.product_variants;
CREATE TRIGGER trg_variants_sync_parent
AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.sync_parent_stock_from_variants();
