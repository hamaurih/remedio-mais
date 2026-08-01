-- 1) Travas separadas + origem da promoção
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS lock_base_price boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_promotion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promotion_source text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_promotion_source_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_promotion_source_check
      CHECK (promotion_source IN ('none', 'manual', 'trier', 'campaign'));
  END IF;
END $$;

-- 2) Backfill seguro: promoções existentes viram promoções manuais protegidas.
--    lock_base_price permanece false (nenhum produto tem prova de trava manual do preço base).
UPDATE public.products
   SET lock_promotion = true,
       promotion_source = CASE WHEN promotion_source = 'none' THEN 'manual' ELSE promotion_source END
 WHERE (on_sale = true
        OR promo_price IS NOT NULL
        OR shelves @> ARRAY['ofertas-da-semana']::text[])
   AND lock_promotion = false;

-- 3) Histórico: campos de contexto da promoção
ALTER TABLE public.product_price_history
  ADD COLUMN IF NOT EXISTS promo_price numeric,
  ADD COLUMN IF NOT EXISTS promotion_status text,
  ADD COLUMN IF NOT EXISTS trier_product_id text;

CREATE OR REPLACE FUNCTION public.log_product_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  old_eff numeric;
  new_eff numeric;
  had_promo boolean;
  has_promo boolean;
  v_type text;
  v_source text;
  v_status text;
BEGIN
  had_promo := OLD.promo_price IS NOT NULL AND OLD.price IS NOT NULL AND OLD.promo_price < OLD.price;
  has_promo := NEW.promo_price IS NOT NULL AND NEW.price IS NOT NULL AND NEW.promo_price < NEW.price;
  old_eff := COALESCE(CASE WHEN had_promo THEN OLD.promo_price END, OLD.price);
  new_eff := COALESCE(CASE WHEN has_promo THEN NEW.promo_price END, NEW.price);

  -- nada mudou: não registra
  IF OLD.price IS NOT DISTINCT FROM NEW.price
     AND OLD.promo_price IS NOT DISTINCT FROM NEW.promo_price
     AND OLD.site_price IS NOT DISTINCT FROM NEW.site_price
     AND OLD.site_promo_price IS NOT DISTINCT FROM NEW.site_promo_price THEN
    RETURN NEW;
  END IF;

  IF has_promo AND NOT had_promo THEN
    v_type := 'promotion_started';
  ELSIF had_promo AND NOT has_promo THEN
    v_type := 'promotion_ended';
  ELSIF new_eff IS NOT NULL AND old_eff IS NOT NULL AND new_eff < old_eff THEN
    v_type := 'decrease';
  ELSIF new_eff IS NOT NULL AND old_eff IS NOT NULL AND new_eff > old_eff THEN
    v_type := 'increase';
  ELSE
    RETURN NEW;
  END IF;

  v_source := NULLIF(current_setting('app.price_change_source', true), '');
  IF v_source IS NULL THEN
    v_source := CASE WHEN auth.uid() IS NULL THEN 'trier' ELSE 'manual' END;
  END IF;

  -- situação da promoção depois da alteração
  IF NEW.promo_price IS NULL THEN
    v_status := 'sem_promocao';
  ELSIF NEW.price IS NOT NULL AND NEW.promo_price >= NEW.price THEN
    v_status := 'inconsistente';
  ELSIF NEW.promotion_end IS NOT NULL AND NEW.promotion_end < now() THEN
    v_status := 'expirada';
  ELSIF NEW.promotion_start IS NOT NULL AND NEW.promotion_start > now() THEN
    v_status := 'futura';
  ELSE
    v_status := 'valida';
  END IF;

  INSERT INTO public.product_price_history(
    product_id, old_price, new_price, old_ecommerce_price, new_ecommerce_price,
    change_type, source, sync_run_id, promo_price, promotion_status, trier_product_id
  ) VALUES (
    NEW.id, OLD.price, NEW.price, OLD.site_price, NEW.site_price,
    v_type, v_source, NULLIF(current_setting('app.sync_run_id', true), ''),
    NEW.promo_price, v_status, NEW.trier_product_id
  );

  RETURN NEW;
END;
$function$;