REVOKE SELECT ON public.product_taxonomy FROM authenticated;
GRANT SELECT (id, product_id, department_id, category_id, subcategory_id, is_primary)
  ON public.product_taxonomy TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_taxonomy_rows(_product_ids uuid[] DEFAULT NULL, _primary_only boolean DEFAULT false)
RETURNS TABLE(id uuid, product_id uuid, department_id uuid, category_id uuid, subcategory_id uuid, is_primary boolean, is_manual boolean, source text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.product_id, t.department_id, t.category_id, t.subcategory_id, t.is_primary, t.is_manual, t.source
    FROM public.product_taxonomy t
   WHERE public.has_role(auth.uid(), 'admin')
     AND (_product_ids IS NULL OR t.product_id = ANY(_product_ids))
     AND (_primary_only = false OR t.is_primary = true);
$$;

REVOKE ALL ON FUNCTION public.admin_taxonomy_rows(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_taxonomy_rows(uuid[], boolean) TO authenticated, service_role;