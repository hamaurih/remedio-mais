-- 1) Melhores Ofertas passa a apontar para a coleção comercial
UPDATE public.menu_items
SET label = 'Melhores Ofertas',
    link_type = 'manual',
    url = '/melhores-ofertas',
    slug = NULL,
    category_id = NULL,
    highlight = true,
    position = 1,
    updated_at = now()
WHERE menu_area = 'header_main'
  AND (lower(label) LIKE 'melhores oferta%' OR url = '/categoria/ofertas');

-- 2) Coleções comerciais no menu do topo
INSERT INTO public.menu_items (menu_area, label, link_type, url, position, active, show_on_desktop, show_on_mobile, highlight)
SELECT 'header_main', 'Ofertas da Semana', 'manual', '/ofertas', 2, true, true, true, false
WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE menu_area = 'header_main' AND url = '/ofertas');

INSERT INTO public.menu_items (menu_area, label, link_type, url, position, active, show_on_desktop, show_on_mobile, highlight)
SELECT 'header_main', 'Medicamentos Populares', 'manual', '/medicamentos-populares', 4, true, true, true, false
WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE menu_area = 'header_main' AND url = '/medicamentos-populares');

-- 3) Ordem fixa, sem empates, para o menu do topo
UPDATE public.menu_items m
SET position = v.pos, updated_at = now()
FROM (VALUES
  ('/melhores-ofertas', 1),
  ('/ofertas', 2),
  ('/categoria/medicamentos', 3),
  ('/medicamentos-populares', 4),
  ('/categoria/genericos', 5),
  ('/categoria/eticos', 6),
  ('/categoria/vitaminas', 7),
  ('/categoria/dermocosmeticos', 8),
  ('/categoria/higiene-pessoal', 9),
  ('/categoria/mamaes-e-bebes', 10),
  ('/categoria/primeiros-socorros', 11),
  ('/categoria/fitness', 12),
  ('/categoria/conveniencia', 13)
) AS v(u, pos)
WHERE m.menu_area = 'header_main' AND m.url = v.u;

-- 4) Ordem também no menu "Todas as categorias" (Medicamentos primeiro)
UPDATE public.menu_items m
SET position = v.pos, updated_at = now()
FROM (VALUES
  ('/categoria/medicamentos', 1),
  ('/categoria/genericos', 2),
  ('/categoria/eticos', 3),
  ('/categoria/dor-e-febre', 4),
  ('/categoria/gripe-e-resfriado', 5),
  ('/categoria/vitaminas', 6),
  ('/categoria/dermocosmeticos', 7),
  ('/categoria/higiene-pessoal', 8),
  ('/categoria/mamaes-e-bebes', 9),
  ('/categoria/primeiros-socorros', 10),
  ('/categoria/fitness', 11),
  ('/categoria/conveniencia', 12)
) AS v(u, pos)
WHERE m.menu_area = 'all_categories' AND m.url = v.u;