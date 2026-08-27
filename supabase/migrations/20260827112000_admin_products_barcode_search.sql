-- Permite localizar produtos na retaguarda por nome, EAN/código de barras,
-- código Trier, SKU, fabricante, princípio ativo, laboratório e categoria.
-- Mantém a paginação e as proteções existentes da função administrativa.

CREATE OR REPLACE FUNCTION public.admin_products_list(
  _search text DEFAULT NULL::text,
  _category_id uuid DEFAULT NULL::uuid,
  _manufacturer text DEFAULT NULL::text,
  _status text DEFAULT 'all'::text,
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_page integer := greatest(coalesce(_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(_page_size, 50), 1), 200);
  v_offset integer;
  v_result jsonb;
  v_search text := nullif(btrim(_search), '');
  v_code text := regexp_replace(coalesce(_search, ''), '\s+', '', 'g');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode consultar produtos completos';
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  WITH filtered AS (
    SELECT p.*, c.name AS category_display_name
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE (
      v_search IS NULL
      OR p.name ILIKE ('%' || v_search || '%')
      OR p.barcode = v_code
      OR p.trier_barcode = v_code
      OR p.sku ILIKE ('%' || v_search || '%')
      OR p.trier_product_id = v_code
      OR p.manufacturer ILIKE ('%' || v_search || '%')
      OR p.active_ingredient ILIKE ('%' || v_search || '%')
      OR p.laboratory ILIKE ('%' || v_search || '%')
      OR p.category_name ILIKE ('%' || v_search || '%')
    )
      AND (_category_id IS NULL OR p.category_id = _category_id)
      AND (_manufacturer IS NULL OR _manufacturer = '' OR p.manufacturer = _manufacturer)
      AND (
        coalesce(_status, 'all') = 'all'
        OR (coalesce(_status, 'all') = 'active' AND p.active = true)
        OR (coalesce(_status, 'all') = 'inactive' AND p.active = false)
        OR (coalesce(_status, 'all') = 'sale' AND p.promo_price IS NOT NULL)
        OR (coalesce(_status, 'all') = 'low' AND p.stock <= coalesce(p.minimum_stock, 5))
        OR (coalesce(_status, 'all') = 'negative_stock' AND coalesce(p.stock, 0) < 0)
        OR (coalesce(_status, 'all') = 'stock_inactive' AND p.active = false AND p.stock > 0)
        OR (coalesce(_status, 'all') = 'no_barcode_stock' AND (p.barcode IS NULL OR p.barcode = '') AND p.stock > 0)
        OR (coalesce(_status, 'all') = 'no_image_stock' AND (p.image_url IS NULL OR p.image_url = '' OR p.image_url ILIKE '%placeholder%') AND p.stock > 0)
      )
  ), counted AS (
    SELECT count(*)::integer AS total_count FROM filtered
  ), paged AS (
    SELECT *
    FROM filtered
    ORDER BY updated_at DESC NULLS LAST, name ASC
    LIMIT v_page_size OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT total_count FROM counted),
    'page', v_page,
    'page_size', v_page_size,
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(paged.*)) FROM paged), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
