INSERT INTO public.home_layout (section_key, label, position, enabled) VALUES
  ('shelf_offers', 'Vitrine: Ofertas da Semana', 71, true),
  ('shelf_bestsellers', 'Vitrine: Mais Vendidos', 72, true),
  ('shelf_meds', 'Vitrine: Medicamentos Populares', 73, true),
  ('shelf_hygiene', 'Vitrine: Higiene e Beleza', 74, true),
  ('shelf_babies', 'Vitrine: Mamães e Bebês', 75, true),
  ('shelf_vitamins', 'Vitrine: Vitaminas e Suplementos', 76, true),
  ('shelf_firstaid', 'Vitrine: Primeiros Socorros', 77, true)
ON CONFLICT (section_key) DO NOTHING;

DELETE FROM public.home_layout WHERE section_key = 'product_shelves';