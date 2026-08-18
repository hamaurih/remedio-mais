-- Keep database availability aligned with the application's single availability rule.
-- Any positive effective stock (stock or stock_quantity) makes the product active,
-- unless an explicit legitimate blocker exists.
-- Zero/negative stock always makes it inactive.
-- Existing auto-unarchive behavior is preserved when stock returns.

CREATE OR REPLACE FUNCTION public.auto_unarchive_on_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  eff integer := GREATEST(COALESCE(NEW.stock, 0), COALESCE(NEW.stock_quantity, 0));
  blocked boolean;
BEGIN
  -- Preserve the existing behavior: inventory returning to an archived product
  -- clears archival metadata so it can become sellable again when not blocked.
  IF NEW.archived_at IS NOT NULL AND eff > 0 THEN
    NEW.archived_at := NULL;
    NEW.archived_by := NULL;
    NEW.archive_reason := NULL;
  END IF;

  blocked := COALESCE(NEW.manual_disabled, false)
    OR NEW.archived_at IS NOT NULL
    OR (NEW.trier_active IS FALSE AND COALESCE(NEW.force_active, false) IS NOT TRUE);

  IF blocked THEN
    NEW.active := false;
  ELSE
    NEW.active := eff > 0;
  END IF;

  RETURN NEW;
END;
$function$;

-- Reconcile existing rows with the same rule. This is idempotent.
UPDATE public.products
SET active = CASE
  WHEN COALESCE(manual_disabled, false) THEN false
  WHEN archived_at IS NOT NULL THEN false
  WHEN trier_active IS FALSE AND COALESCE(force_active, false) IS NOT TRUE THEN false
  ELSE GREATEST(COALESCE(stock, 0), COALESCE(stock_quantity, 0)) > 0
END
WHERE active IS DISTINCT FROM CASE
  WHEN COALESCE(manual_disabled, false) THEN false
  WHEN archived_at IS NOT NULL THEN false
  WHEN trier_active IS FALSE AND COALESCE(force_active, false) IS NOT TRUE THEN false
  ELSE GREATEST(COALESCE(stock, 0), COALESCE(stock_quantity, 0)) > 0
END;
