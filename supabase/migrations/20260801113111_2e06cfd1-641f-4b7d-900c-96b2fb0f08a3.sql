
CREATE TABLE IF NOT EXISTS public.product_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  old_price numeric,
  new_price numeric,
  old_ecommerce_price numeric,
  new_ecommerce_price numeric,
  change_type text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  sync_run_id text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_price_history TO authenticated;
GRANT ALL ON public.product_price_history TO service_role;

ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_history_admin_read" ON public.product_price_history;
CREATE POLICY "price_history_admin_read" ON public.product_price_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'seller'));

CREATE INDEX IF NOT EXISTS idx_pph_changed_at ON public.product_price_history (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pph_product ON public.product_price_history (product_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pph_type ON public.product_price_history (change_type, changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_product_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_eff numeric;
  new_eff numeric;
  had_promo boolean;
  has_promo boolean;
  v_type text;
  v_source text;
BEGIN
  had_promo := OLD.promo_price IS NOT NULL AND OLD.price IS NOT NULL AND OLD.promo_price < OLD.price;
  has_promo := NEW.promo_price IS NOT NULL AND NEW.price IS NOT NULL AND NEW.promo_price < NEW.price;
  old_eff := COALESCE(CASE WHEN had_promo THEN OLD.promo_price END, OLD.price);
  new_eff := COALESCE(CASE WHEN has_promo THEN NEW.promo_price END, NEW.price);

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

  INSERT INTO public.product_price_history(
    product_id, old_price, new_price, old_ecommerce_price, new_ecommerce_price,
    change_type, source, sync_run_id
  ) VALUES (
    NEW.id, OLD.price, NEW.price, OLD.site_price, NEW.site_price,
    v_type, v_source, NULLIF(current_setting('app.sync_run_id', true), '')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_product_price_change ON public.products;
CREATE TRIGGER trg_log_product_price_change
  AFTER UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.log_product_price_change();

CREATE OR REPLACE FUNCTION public.public_bestsellers(_days integer DEFAULT 30, _limit integer DEFAULT 12)
RETURNS TABLE(product_id uuid, units bigint, orders_count bigint, revenue numeric, last_sale_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH valid_items AS (
    SELECT oi.id, oi.product_id, oi.quantity, oi.total, oi.order_id, o.created_at
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
     WHERE oi.product_id IS NOT NULL
       AND o.payment_status = 'approved'
       AND COALESCE(o.status, '') NOT IN ('cancelado', 'cancelled', 'recusado', 'refused', 'reembolsado', 'refunded')
       AND COALESCE(o.order_status, '') NOT IN ('cancelado', 'cancelled', 'recusado', 'refused')
       AND (_days IS NULL OR _days <= 0 OR o.created_at >= now() - make_interval(days => _days))
  ), refunded AS (
    SELECT ri.order_item_id, SUM(ri.quantity)::bigint AS qty
      FROM public.refund_items ri
      JOIN public.refund_requests rr ON rr.id = ri.refund_request_id
     WHERE COALESCE(rr.status, '') IN ('approved', 'aprovado', 'executed', 'executado', 'refunded', 'reembolsado')
     GROUP BY ri.order_item_id
  )
  SELECT vi.product_id,
         GREATEST(SUM(vi.quantity - COALESCE(r.qty, 0)), 0)::bigint AS units,
         COUNT(DISTINCT vi.order_id)::bigint AS orders_count,
         COALESCE(SUM(vi.total), 0)::numeric AS revenue,
         MAX(vi.created_at) AS last_sale_at
    FROM valid_items vi
    LEFT JOIN refunded r ON r.order_item_id = vi.id
   GROUP BY vi.product_id
  HAVING GREATEST(SUM(vi.quantity - COALESCE(r.qty, 0)), 0) > 0
   ORDER BY units DESC, orders_count DESC, last_sale_at DESC, revenue DESC
   LIMIT COALESCE(_limit, 12);
$$;

GRANT EXECUTE ON FUNCTION public.public_bestsellers(integer, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_bestsellers_diagnostic(_days integer DEFAULT 30, _limit integer DEFAULT 50)
RETURNS TABLE(rank_position integer, product_id uuid, product_name text, trier_code text, units bigint, orders_count bigint, revenue numeric, stock integer, active boolean, price numeric, visible boolean, hidden_reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (ROW_NUMBER() OVER (ORDER BY b.units DESC, b.orders_count DESC, b.last_sale_at DESC))::int,
         p.id, p.name, p.trier_product_id::text, b.units, b.orders_count, b.revenue,
         p.stock, p.active, p.price,
         (p.active AND COALESCE(p.stock,0) > 0 AND COALESCE(p.price,0) > 0 AND p.archived_at IS NULL) AS visible,
         CASE
           WHEN NOT p.active THEN 'Produto inativo'
           WHEN p.archived_at IS NOT NULL THEN 'Produto arquivado'
           WHEN COALESCE(p.stock,0) <= 0 THEN 'Sem estoque'
           WHEN COALESCE(p.price,0) <= 0 THEN 'Sem preço'
           ELSE NULL
         END AS hidden_reason
    FROM public.public_bestsellers(_days, _limit) b
    JOIN public.products p ON p.id = b.product_id
   WHERE public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'seller');
$$;

GRANT EXECUTE ON FUNCTION public.admin_bestsellers_diagnostic(integer, integer) TO authenticated, service_role;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS bestsellers_period_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS bestsellers_limit integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS best_offers_theme text NOT NULL DEFAULT 'yellow',
  ADD COLUMN IF NOT EXISTS best_offers_title text NOT NULL DEFAULT 'Melhores Ofertas',
  ADD COLUMN IF NOT EXISTS best_offers_subtitle text,
  ADD COLUMN IF NOT EXISTS best_offers_limit integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS best_offers_auto_price_drop boolean NOT NULL DEFAULT false;
