CREATE OR REPLACE FUNCTION public.auto_unarchive_on_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND COALESCE(NEW.stock_quantity, NEW.stock, 0) > 0 THEN
    NEW.archived_at := NULL;
    NEW.archived_by := NULL;
    NEW.archive_reason := NULL;
    IF COALESCE(NEW.manual_disabled, false) = false
       AND (COALESCE(NEW.trier_active, true) = true OR COALESCE(NEW.force_active, false) = true) THEN
      NEW.active := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_unarchive_on_stock ON public.products;
CREATE TRIGGER trg_auto_unarchive_on_stock
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.auto_unarchive_on_stock();