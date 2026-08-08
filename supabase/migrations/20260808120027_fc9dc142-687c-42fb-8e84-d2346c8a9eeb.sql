-- 1) Corrigir divergência: stock_quantity defasado escondia produtos com estoque
UPDATE public.products
   SET stock_quantity = stock
 WHERE COALESCE(stock,0) > 0
   AND COALESCE(stock_quantity, -1) <> stock;

-- 2) Regra de estoque = MAIOR valor entre as duas colunas
CREATE OR REPLACE FUNCTION public.auto_unarchive_on_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  eff int := GREATEST(COALESCE(NEW.stock, 0), COALESCE(NEW.stock_quantity, 0));
BEGIN
  IF NEW.archived_at IS NOT NULL AND eff > 0 THEN
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
$function$;

-- 3) Desarquivar/reativar quem tem estoque agora
UPDATE public.products
   SET archived_at = NULL, archived_by = NULL, archive_reason = NULL,
       active = CASE WHEN COALESCE(manual_disabled,false) = false
                      AND (COALESCE(trier_active, true) = true OR COALESCE(force_active,false) = true)
                     THEN true ELSE active END
 WHERE GREATEST(COALESCE(stock,0), COALESCE(stock_quantity,0)) > 0
   AND archived_at IS NOT NULL;