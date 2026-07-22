
-- 1. Colunas de arquivamento
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

CREATE INDEX IF NOT EXISTS idx_products_archived_at ON public.products(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_not_archived ON public.products(active, stock) WHERE archived_at IS NULL;

-- 2. Preview: conta e resume o que seria arquivado
CREATE OR REPLACE FUNCTION public.admin_archive_preview(_months_without_sale int DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff timestamptz;
  v_total int;
  v_never_sold int;
  v_old_sale int;
  v_sample jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;

  cutoff := now() - make_interval(months => _months_without_sale);

  WITH candidates AS (
    SELECT p.id, p.name, p.stock, p.active,
           (SELECT MAX(o.created_at)
              FROM public.order_items oi
              JOIN public.orders o ON o.id = oi.order_id
             WHERE oi.product_id = p.id) AS last_sale_at
      FROM public.products p
     WHERE p.archived_at IS NULL
       AND p.active = false
       AND COALESCE(p.stock, 0) = 0
  ), filtered AS (
    SELECT * FROM candidates
     WHERE last_sale_at IS NULL OR last_sale_at < cutoff
  )
  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE last_sale_at IS NULL)::int,
         COUNT(*) FILTER (WHERE last_sale_at IS NOT NULL)::int,
         COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'last_sale_at', last_sale_at)
                            ORDER BY last_sale_at NULLS FIRST) FILTER (WHERE true), '[]'::jsonb)
    INTO v_total, v_never_sold, v_old_sale, v_sample
    FROM (SELECT * FROM filtered LIMIT 50) s;

  -- Contagens reais (não limitadas ao sample)
  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE last_sale_at IS NULL)::int,
         COUNT(*) FILTER (WHERE last_sale_at IS NOT NULL)::int
    INTO v_total, v_never_sold, v_old_sale
    FROM (
      SELECT (SELECT MAX(o.created_at)
                FROM public.order_items oi
                JOIN public.orders o ON o.id = oi.order_id
               WHERE oi.product_id = p.id) AS last_sale_at
        FROM public.products p
       WHERE p.archived_at IS NULL
         AND p.active = false
         AND COALESCE(p.stock, 0) = 0
    ) s
    WHERE last_sale_at IS NULL OR last_sale_at < cutoff;

  RETURN jsonb_build_object(
    'total', v_total,
    'never_sold', v_never_sold,
    'old_sale', v_old_sale,
    'cutoff', cutoff,
    'months_without_sale', _months_without_sale,
    'sample', v_sample
  );
END;
$$;

-- 3. Aplicar arquivamento
CREATE OR REPLACE FUNCTION public.admin_archive_apply(_months_without_sale int DEFAULT 6, _limit int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff timestamptz;
  v_count int;
  actor uuid := auth.uid();
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;

  cutoff := now() - make_interval(months => _months_without_sale);

  WITH candidates AS (
    SELECT p.id
      FROM public.products p
     WHERE p.archived_at IS NULL
       AND p.active = false
       AND COALESCE(p.stock, 0) = 0
       AND NOT EXISTS (
         SELECT 1 FROM public.order_items oi
         JOIN public.orders o ON o.id = oi.order_id
         WHERE oi.product_id = p.id AND o.created_at >= cutoff
       )
     LIMIT COALESCE(_limit, 100000)
  )
  UPDATE public.products p
     SET archived_at = now(),
         archived_by = actor,
         archive_reason = 'auto: inativo + sem estoque + sem venda >= ' || _months_without_sale || 'm'
    FROM candidates c
   WHERE p.id = c.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.admin_audit_log(actor_id, action, entity_type, entity_id, metadata)
  VALUES (actor, 'products.archive_bulk', 'product', 'bulk',
          jsonb_build_object('count', v_count, 'months', _months_without_sale, 'cutoff', cutoff));

  RETURN jsonb_build_object('archived', v_count, 'cutoff', cutoff);
END;
$$;

-- 4. Desarquivar (individual)
CREATE OR REPLACE FUNCTION public.admin_unarchive_product(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  UPDATE public.products
     SET archived_at = NULL, archived_by = NULL, archive_reason = NULL
   WHERE id = _id;
END;
$$;
