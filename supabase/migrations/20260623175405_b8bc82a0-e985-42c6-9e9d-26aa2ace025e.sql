GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

CREATE OR REPLACE FUNCTION public.admin_products_list(
  _search text DEFAULT NULL,
  _category_id uuid DEFAULT NULL,
  _manufacturer text DEFAULT NULL,
  _status text DEFAULT 'all',
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(_page_size, 50), 1), 200);
  v_offset integer;
  v_result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode consultar produtos completos';
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  WITH filtered AS (
    SELECT p.*, c.name AS category_display_name
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE (_search IS NULL OR _search = '' OR p.name ILIKE ('%' || _search || '%'))
      AND (_category_id IS NULL OR p.category_id = _category_id)
      AND (_manufacturer IS NULL OR _manufacturer = '' OR p.manufacturer = _manufacturer)
      AND (
        COALESCE(_status, 'all') = 'all'
        OR (COALESCE(_status, 'all') = 'active' AND p.active = true)
        OR (COALESCE(_status, 'all') = 'inactive' AND p.active = false)
        OR (COALESCE(_status, 'all') = 'sale' AND p.promo_price IS NOT NULL)
        OR (COALESCE(_status, 'all') = 'low' AND p.stock <= COALESCE(p.minimum_stock, 5))
      )
  ), counted AS (
    SELECT COUNT(*)::integer AS total_count FROM filtered
  ), paged AS (
    SELECT *
    FROM filtered
    ORDER BY name ASC NULLS LAST
    OFFSET v_offset
    LIMIT v_page_size
  )
  SELECT jsonb_build_object(
    'rows', COALESCE(
      jsonb_agg(
        (to_jsonb(paged) - 'category_display_name') || jsonb_build_object('categories', jsonb_build_object('name', paged.category_display_name))
        ORDER BY paged.name ASC NULLS LAST
      ),
      '[]'::jsonb
    ),
    'count', (SELECT total_count FROM counted)
  )
  INTO v_result
  FROM paged;

  RETURN COALESCE(v_result, jsonb_build_object('rows', '[]'::jsonb, 'count', 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_product_detail(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode consultar produto completo';
  END IF;

  SELECT (to_jsonb(p) || jsonb_build_object('categories', jsonb_build_object('name', c.name)))
  INTO v_result
  FROM public.products p
  LEFT JOIN public.categories c ON c.id = p.category_id
  WHERE p.id = _id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_products_list(text, uuid, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_product_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_products_list(text, uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_product_detail(uuid) TO authenticated;