
-- =====================================================================
-- Phase 1: Commercial Taxonomy Foundation (additive, non-destructive)
-- =====================================================================

-- 1) DEPARTMENTS
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  image_url text,
  icon text,
  band_color text,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  show_in_menu boolean NOT NULL DEFAULT true,
  show_on_home boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.departments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_public_read_active"
  ON public.departments FOR SELECT
  TO anon, authenticated
  USING (active = true);

CREATE POLICY "departments_admin_all"
  ON public.departments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_departments_active_position
  ON public.departments(active, position);

-- 2) Add optional FK on existing categories table (nullable, non-breaking)
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_department_id
  ON public.categories(department_id);

-- 3) SUBCATEGORIES
CREATE TABLE IF NOT EXISTS public.subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  icon text,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  show_in_menu boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug)
);

GRANT SELECT ON public.subcategories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcategories TO authenticated;
GRANT ALL ON public.subcategories TO service_role;

ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subcategories_public_read_active"
  ON public.subcategories FOR SELECT
  TO anon, authenticated
  USING (active = true);

CREATE POLICY "subcategories_admin_all"
  ON public.subcategories FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_subcategories_updated_at
  BEFORE UPDATE ON public.subcategories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_subcategories_category_active_position
  ON public.subcategories(category_id, active, position);

-- 4) PRODUCT_TAXONOMY (N:N classification with manual-vs-auto flag)
CREATE TABLE IF NOT EXISTS public.product_taxonomy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES public.subcategories(id) ON DELETE SET NULL,
  is_primary boolean NOT NULL DEFAULT false,
  is_manual boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual', -- 'manual' | 'trier_map' | 'seed'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_taxonomy TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_taxonomy TO authenticated;
GRANT ALL ON public.product_taxonomy TO service_role;

ALTER TABLE public.product_taxonomy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_taxonomy_public_read"
  ON public.product_taxonomy FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "product_taxonomy_admin_all"
  ON public.product_taxonomy FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_product_taxonomy_updated_at
  BEFORE UPDATE ON public.product_taxonomy
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_product_taxonomy_product ON public.product_taxonomy(product_id);
CREATE INDEX IF NOT EXISTS idx_product_taxonomy_department ON public.product_taxonomy(department_id);
CREATE INDEX IF NOT EXISTS idx_product_taxonomy_category ON public.product_taxonomy(category_id);
CREATE INDEX IF NOT EXISTS idx_product_taxonomy_subcategory ON public.product_taxonomy(subcategory_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_taxonomy_primary
  ON public.product_taxonomy(product_id) WHERE is_primary = true;

-- 5) TRIER_CATEGORY_MAPPINGS (rules; applied only on admin demand)
CREATE TABLE IF NOT EXISTS public.trier_category_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_field text NOT NULL CHECK (source_field IN ('nomeCategoria','nomeGrupo','nomeDepartamento','productName')),
  match_type text NOT NULL CHECK (match_type IN ('equals','contains','starts_with')),
  match_value text NOT NULL,
  case_sensitive boolean NOT NULL DEFAULT false,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES public.subcategories(id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trier_category_mappings TO authenticated;
GRANT ALL ON public.trier_category_mappings TO service_role;

ALTER TABLE public.trier_category_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trier_category_mappings_admin_all"
  ON public.trier_category_mappings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_trier_category_mappings_updated_at
  BEFORE UPDATE ON public.trier_category_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_trier_category_mappings_active_priority
  ON public.trier_category_mappings(active, priority);

-- 6) SEED departments
INSERT INTO public.departments (name, slug, position, band_color)
VALUES
  ('Medicamentos',           'medicamentos',           10, '#E11D2E'),
  ('Vitaminas e Suplementos','vitaminas-e-suplementos',20, '#16A34A'),
  ('Mamães e Bebês',         'mamaes-e-bebes',         30, '#F472B6'),
  ('Higiene Pessoal',        'higiene-pessoal',        40, '#0EA5E9'),
  ('Dermocosméticos',        'dermocosmeticos',        50, '#A855F7'),
  ('Primeiros Socorros',     'primeiros-socorros',     60, '#DC2626'),
  ('Conveniência',           'conveniencia',           70, '#F59E0B')
ON CONFLICT (slug) DO NOTHING;

-- 7) Best-effort link existing categories to departments via macro_group / name
UPDATE public.categories c
SET department_id = d.id
FROM public.departments d
WHERE c.department_id IS NULL
  AND (
    LOWER(COALESCE(c.macro_group,'')) LIKE '%' || LOWER(d.name) || '%'
    OR LOWER(c.name) = LOWER(d.name)
  );

-- Map remaining well-known categories
UPDATE public.categories SET department_id = (SELECT id FROM public.departments WHERE slug='medicamentos')
  WHERE department_id IS NULL AND slug IN ('medicamentos','genericos','dor-e-febre','gripe-e-resfriado','antialergicos','anti-inflamatorios','digestivos','diabetes','pressao-alta','controlados','sem-receita','aparelhos-de-saude');
UPDATE public.categories SET department_id = (SELECT id FROM public.departments WHERE slug='vitaminas-e-suplementos')
  WHERE department_id IS NULL AND slug IN ('vitaminas','suplementos','vitamina-c','vitamina-d','colageno','omega','calcio','proteinas');
UPDATE public.categories SET department_id = (SELECT id FROM public.departments WHERE slug='mamaes-e-bebes')
  WHERE department_id IS NULL AND slug IN ('mamaes-e-bebes','fraldas','formulas-infantis','lencos-umedecidos','chupetas','mamadeiras');
UPDATE public.categories SET department_id = (SELECT id FROM public.departments WHERE slug='higiene-pessoal')
  WHERE department_id IS NULL AND slug IN ('higiene-pessoal','saude-bucal','cabelos','desodorantes','absorventes','sabonetes');
UPDATE public.categories SET department_id = (SELECT id FROM public.departments WHERE slug='dermocosmeticos')
  WHERE department_id IS NULL AND slug IN ('dermocosmeticos','protetor-solar','anti-idade','acne','hidratacao');
UPDATE public.categories SET department_id = (SELECT id FROM public.departments WHERE slug='primeiros-socorros')
  WHERE department_id IS NULL AND slug IN ('primeiros-socorros','curativos','gaze-e-ataduras','antissepticos','termometros','oximetros','seringas','luvas');
UPDATE public.categories SET department_id = (SELECT id FROM public.departments WHERE slug='conveniencia')
  WHERE department_id IS NULL AND slug IN ('conveniencia','bebidas','snacks','utilidades','pet');

-- 8) SEED subcategories — only when matching parent category already exists
-- Helper inline: insert (category_slug, sub_name, sub_slug, position)
WITH seed(cat_slug, sub_name, sub_slug, pos) AS (
  VALUES
    -- Medicamentos
    ('dor-e-febre','Analgésicos','analgesicos',10),
    ('dor-e-febre','Antitérmicos','antitermicos',20),
    ('gripe-e-resfriado','Descongestionantes','descongestionantes',10),
    ('gripe-e-resfriado','Antigripais','antigripais',20),
    ('gripe-e-resfriado','Tosse','tosse',30),
    -- Vitaminas
    ('vitaminas','Multivitamínicos','multivitaminicos',10),
    ('vitaminas','Vitamina C','vitamina-c',20),
    ('vitaminas','Vitamina D','vitamina-d',30),
    ('vitaminas','Cálcio','calcio',40),
    ('vitaminas','Ômega','omega',50),
    ('vitaminas','Colágeno','colageno',60),
    -- Mamães e Bebês
    ('mamaes-e-bebes','Fraldas','fraldas',10),
    ('mamaes-e-bebes','Fórmulas Infantis','formulas-infantis',20),
    ('mamaes-e-bebes','Lenços Umedecidos','lencos-umedecidos',30),
    ('mamaes-e-bebes','Chupetas','chupetas',40),
    ('mamaes-e-bebes','Mamadeiras','mamadeiras',50),
    ('mamaes-e-bebes','Higiene Infantil','higiene-infantil',60),
    -- Higiene Pessoal
    ('higiene-pessoal','Saúde Bucal','saude-bucal',10),
    ('higiene-pessoal','Cabelos','cabelos',20),
    ('higiene-pessoal','Corpo','corpo',30),
    ('higiene-pessoal','Desodorantes','desodorantes',40),
    ('higiene-pessoal','Absorventes','absorventes',50),
    ('higiene-pessoal','Sabonetes','sabonetes',60),
    -- Dermocosméticos
    ('dermocosmeticos','Protetor Solar','protetor-solar',10),
    ('dermocosmeticos','Rosto','rosto',20),
    ('dermocosmeticos','Corpo','corpo',30),
    ('dermocosmeticos','Anti-idade','anti-idade',40),
    ('dermocosmeticos','Acne','acne',50),
    ('dermocosmeticos','Hidratação','hidratacao',60),
    -- Primeiros Socorros
    ('primeiros-socorros','Curativos','curativos',10),
    ('primeiros-socorros','Gaze e Ataduras','gaze-e-ataduras',20),
    ('primeiros-socorros','Antissépticos','antissepticos',30),
    ('primeiros-socorros','Termômetros','termometros',40),
    ('primeiros-socorros','Oxímetros','oximetros',50),
    ('primeiros-socorros','Seringas','seringas',60),
    ('primeiros-socorros','Luvas','luvas',70),
    -- Conveniência
    ('conveniencia','Bebidas','bebidas',10),
    ('conveniencia','Snacks','snacks',20),
    ('conveniencia','Cuidados Diários','cuidados-diarios',30),
    ('conveniencia','Utilidades','utilidades',40),
    ('conveniencia','Pet','pet',50)
)
INSERT INTO public.subcategories (category_id, name, slug, position)
SELECT c.id, s.sub_name, s.sub_slug, s.pos
FROM seed s
JOIN public.categories c ON c.slug = s.cat_slug
ON CONFLICT (category_id, slug) DO NOTHING;
