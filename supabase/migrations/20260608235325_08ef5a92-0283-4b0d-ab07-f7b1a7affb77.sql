
CREATE OR REPLACE FUNCTION public.sync_parent_has_variants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  active_count int;
  first_type text;
BEGIN
  pid := COALESCE(NEW.parent_product_id, OLD.parent_product_id);
  IF pid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COUNT(*), MIN(variation_type)
    INTO active_count, first_type
    FROM public.product_variants
   WHERE parent_product_id = pid AND active = true AND COALESCE(TRIM(variation_value),'') <> '';

  UPDATE public.products
     SET has_variants = (active_count > 0),
         variation_type = CASE WHEN active_count > 0 THEN COALESCE(first_type, 'tamanho') ELSE NULL END
   WHERE id = pid;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_parent_has_variants_ins ON public.product_variants;
DROP TRIGGER IF EXISTS trg_sync_parent_has_variants_upd ON public.product_variants;
DROP TRIGGER IF EXISTS trg_sync_parent_has_variants_del ON public.product_variants;

CREATE TRIGGER trg_sync_parent_has_variants_ins
AFTER INSERT ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.sync_parent_has_variants();

CREATE TRIGGER trg_sync_parent_has_variants_upd
AFTER UPDATE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.sync_parent_has_variants();

CREATE TRIGGER trg_sync_parent_has_variants_del
AFTER DELETE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.sync_parent_has_variants();

-- Backfill: marca como has_variants todos os pais que já têm variações ativas
UPDATE public.products p
   SET has_variants = true,
       variation_type = COALESCE(p.variation_type, sub.first_type, 'tamanho')
  FROM (
    SELECT parent_product_id, MIN(variation_type) AS first_type
      FROM public.product_variants
     WHERE active = true AND COALESCE(TRIM(variation_value),'') <> ''
     GROUP BY parent_product_id
  ) sub
 WHERE p.id = sub.parent_product_id
   AND (p.has_variants IS DISTINCT FROM true);
