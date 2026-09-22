-- Consolida a taxonomia comercial usando os dados já existentes.
-- Não remove categorias, não altera classificações manuais e pode ser reexecutada.

-- 1) Completa vínculos de categorias existentes com os departamentos oficiais.
UPDATE public.categories c
SET department_id = d.id
FROM public.departments d
WHERE c.department_id IS NULL
  AND (
    lower(trim(coalesce(c.macro_group, ''))) = lower(trim(d.name))
    OR lower(trim(coalesce(c.name, ''))) = lower(trim(d.name))
    OR lower(trim(coalesce(c.macro_group, ''))) LIKE '%' || lower(trim(d.name)) || '%'
  );

-- 2) Cria a classificação primária dos produtos que já possuem categoria.
-- A classificação manual nunca é sobrescrita.
UPDATE public.product_taxonomy t
SET
  department_id = coalesce(t.department_id, c.department_id),
  category_id = coalesce(t.category_id, p.category_id),
  source = case when t.is_manual then t.source else coalesce(t.source, 'legacy_category') end,
  updated_at = now()
FROM public.products p
JOIN public.categories c ON c.id = p.category_id
WHERE t.product_id = p.id
  AND t.is_manual = false
  AND (t.department_id IS NULL OR t.category_id IS NULL);

INSERT INTO public.product_taxonomy
  (product_id, department_id, category_id, is_primary, is_manual, source)
SELECT
  p.id,
  c.department_id,
  c.id,
  true,
  false,
  'legacy_category'
FROM public.products p
JOIN public.categories c ON c.id = p.category_id
WHERE c.department_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.product_taxonomy t
    WHERE t.product_id = p.id
      AND t.is_primary = true
  );

-- 3) Usa os campos do Trier para vincular subcategorias quando houver
-- correspondência segura por nome. Não cria classificação aproximada.
UPDATE public.product_taxonomy t
SET
  subcategory_id = s.id,
  updated_at = now()
FROM public.products p, public.subcategories s
WHERE s.category_id = t.category_id
  AND (
   lower(trim(s.name)) = lower(trim(coalesce(p.group_name, '')))
   OR lower(trim(s.name)) = lower(trim(coalesce(p.category_name, '')))
  )
  AND t.product_id = p.id
  AND t.is_primary = true
  AND t.is_manual = false
  AND t.subcategory_id IS NULL;

-- 4) Índices para menu, catálogo e revisão de classificação.
CREATE INDEX IF NOT EXISTS idx_products_department_category
  ON public.products(category_id);

CREATE INDEX IF NOT EXISTS idx_product_taxonomy_primary_full
  ON public.product_taxonomy(product_id, department_id, category_id, subcategory_id)
  WHERE is_primary = true;
