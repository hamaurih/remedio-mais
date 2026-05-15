
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "user_roles_self_read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  position INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "categories_public_read" ON public.categories FOR SELECT USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "categories_admin_write" ON public.categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  promo_price NUMERIC(10,2),
  image_url TEXT,
  manufacturer TEXT,
  active_ingredient TEXT,
  stock INT NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  on_sale BOOLEAN NOT NULL DEFAULT false,
  requires_prescription BOOLEAN NOT NULL DEFAULT false,
  controlled BOOLEAN NOT NULL DEFAULT false,
  tarja TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "products_admin_write" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Banners
CREATE TABLE public.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  subtitle TEXT,
  image_url TEXT,
  link TEXT,
  position INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_banners_updated BEFORE UPDATE ON public.banners FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "banners_public_read" ON public.banners FOR SELECT USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "banners_admin_write" ON public.banners FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT,
  delivery_method TEXT NOT NULL DEFAULT 'pickup',
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'novo',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_public_insert" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_admin_read" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "orders_admin_update" ON public.orders FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "orders_admin_delete" ON public.orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INT NOT NULL
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_public_insert" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "order_items_admin_read" ON public.order_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Prescriptions
CREATE TABLE public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  notes TEXT,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'recebida',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prescriptions_public_insert" ON public.prescriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "prescriptions_admin_read" ON public.prescriptions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "prescriptions_admin_update" ON public.prescriptions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Store settings (single row)
CREATE TABLE public.store_settings (
  id INT PRIMARY KEY DEFAULT 1,
  whatsapp TEXT,
  address TEXT,
  instagram TEXT,
  hours TEXT,
  delivery_fee NUMERIC(10,2) DEFAULT 0,
  hero_title TEXT,
  hero_subtitle TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.store_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "settings_public_read" ON public.store_settings FOR SELECT USING (true);
CREATE POLICY "settings_admin_write" ON public.store_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('products', 'products', true),
  ('banners', 'banners', true),
  ('prescriptions', 'prescriptions', false);

CREATE POLICY "products_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'products');
CREATE POLICY "banners_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'banners');
CREATE POLICY "products_admin_write" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'products' AND public.has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'products' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "banners_admin_write" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "prescriptions_public_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'prescriptions');
CREATE POLICY "prescriptions_admin_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'prescriptions' AND public.has_role(auth.uid(), 'admin'));

-- Seed settings
INSERT INTO public.store_settings (id, whatsapp, address, instagram, hours, delivery_fee, hero_title, hero_subtitle)
VALUES (1, '5583999286000', 'Av. Mal. Floriano Peixoto, 4050 - Malvinas, Campina Grande - PB, 58428-111', 'https://www.instagram.com/atacadaodosmedicamentoscg/', 'Seg a Sáb: 7h às 22h | Dom: 8h às 20h', 0, 'Preço baixo todo dia na Atacadão dos Medicamentos', 'Variedade, atendimento rápido e entrega local em Campina Grande');

-- Seed categories
INSERT INTO public.categories (name, slug, icon, position) VALUES
  ('Ofertas', 'ofertas', 'Tag', 1),
  ('Medicamentos', 'medicamentos', 'Pill', 2),
  ('Genéricos', 'genericos', 'Capsule', 3),
  ('Dor e Febre', 'dor-e-febre', 'Thermometer', 4),
  ('Gripe e Resfriado', 'gripe-e-resfriado', 'Wind', 5),
  ('Vitaminas', 'vitaminas', 'Sun', 6),
  ('Higiene Pessoal', 'higiene-pessoal', 'Droplet', 7),
  ('Mamães e Bebês', 'mamaes-e-bebes', 'Baby', 8),
  ('Dermocosméticos', 'dermocosmeticos', 'Sparkles', 9),
  ('Conveniência', 'conveniencia', 'ShoppingBag', 10),
  ('Primeiros Socorros', 'primeiros-socorros', 'BandageIcon', 11),
  ('Aparelhos de Saúde', 'aparelhos-de-saude', 'HeartPulse', 12);

-- Seed banners
INSERT INTO public.banners (title, subtitle, image_url, link, position) VALUES
  ('Atacadão dos Medicamentos', 'Os melhores preços de Campina Grande', null, '/categoria/ofertas', 1),
  ('Vitaminas em promoção', 'Cuide da sua saúde gastando menos', null, '/categoria/vitaminas', 2),
  ('Mamães e Bebês', 'Tudo para o seu bebê com preço baixo', null, '/categoria/mamaes-e-bebes', 3);

-- Seed products (fictional)
WITH c AS (SELECT id, slug FROM public.categories)
INSERT INTO public.products (name, slug, category_id, description, price, promo_price, manufacturer, stock, featured, on_sale, requires_prescription, controlled, tarja)
VALUES
  ('Analgésico Dipirona 500mg 20 cp', 'analgesico-dipirona-500mg', (SELECT id FROM c WHERE slug='dor-e-febre'), 'Comprimidos para alívio de dor e febre.', 9.90, 6.49, 'GenLab', 120, true, true, false, false, null),
  ('Paracetamol 750mg 20 cp', 'paracetamol-750mg', (SELECT id FROM c WHERE slug='dor-e-febre'), 'Analgésico e antitérmico.', 12.50, 8.90, 'FarmaBase', 80, true, true, false, false, null),
  ('Ibuprofeno 400mg 10 cp', 'ibuprofeno-400mg', (SELECT id FROM c WHERE slug='dor-e-febre'), 'Anti-inflamatório.', 14.00, null, 'GenLab', 60, false, false, false, false, null),
  ('Vitamina C 1g efervescente 10 cp', 'vitamina-c-1g', (SELECT id FROM c WHERE slug='vitaminas'), 'Suplemento vitamínico.', 19.90, 14.90, 'NutriVita', 150, true, true, false, false, null),
  ('Multivitamínico 60 cápsulas', 'multivitaminico-60', (SELECT id FROM c WHERE slug='vitaminas'), 'Complexo multivitamínico diário.', 49.90, 39.90, 'NutriVita', 70, true, true, false, false, null),
  ('Antigripal Dia/Noite 12 cp', 'antigripal-dia-noite', (SELECT id FROM c WHERE slug='gripe-e-resfriado'), 'Alívio dos sintomas da gripe.', 24.90, 18.90, 'PharmaPlus', 90, true, true, false, false, null),
  ('Spray Nasal 30ml', 'spray-nasal-30ml', (SELECT id FROM c WHERE slug='gripe-e-resfriado'), 'Descongestionante nasal.', 17.50, null, 'NazalCare', 50, false, false, false, false, null),
  ('Sabonete Líquido Íntimo 200ml', 'sabonete-intimo-200ml', (SELECT id FROM c WHERE slug='higiene-pessoal'), 'Higiene íntima diária.', 22.00, 16.90, 'DermaPure', 40, false, true, false, false, null),
  ('Escova Dental Macia', 'escova-dental-macia', (SELECT id FROM c WHERE slug='higiene-pessoal'), 'Cerdas macias.', 8.90, 5.90, 'OralCare', 200, false, true, false, false, null),
  ('Fralda Bebê M 40 unidades', 'fralda-bebe-m-40', (SELECT id FROM c WHERE slug='mamaes-e-bebes'), 'Fraldas confortáveis tamanho M.', 59.90, 44.90, 'BabySoft', 30, true, true, false, false, null),
  ('Lenço Umedecido 100un', 'lenco-umedecido-100', (SELECT id FROM c WHERE slug='mamaes-e-bebes'), 'Lenços para higiene do bebê.', 14.90, 9.90, 'BabySoft', 100, true, true, false, false, null),
  ('Protetor Solar FPS 50 120ml', 'protetor-solar-fps50', (SELECT id FROM c WHERE slug='dermocosmeticos'), 'Proteção solar diária.', 79.90, 59.90, 'SunDerm', 25, true, true, false, false, null),
  ('Hidratante Facial 50g', 'hidratante-facial-50g', (SELECT id FROM c WHERE slug='dermocosmeticos'), 'Hidratação leve.', 49.90, null, 'DermaPure', 35, false, false, false, false, null),
  ('Termômetro Digital', 'termometro-digital', (SELECT id FROM c WHERE slug='aparelhos-de-saude'), 'Medição rápida e precisa.', 39.90, 29.90, 'MediTech', 40, true, true, false, false, null),
  ('Aparelho de Pressão Digital', 'aparelho-pressao-digital', (SELECT id FROM c WHERE slug='aparelhos-de-saude'), 'Medidor de pressão arterial.', 199.00, 169.00, 'MediTech', 15, true, true, false, false, null),
  ('Curativo Adesivo 20un', 'curativo-adesivo-20', (SELECT id FROM c WHERE slug='primeiros-socorros'), 'Curativos resistentes à água.', 9.90, 6.90, 'CareBand', 80, false, true, false, false, null),
  ('Álcool 70% 500ml', 'alcool-70-500', (SELECT id FROM c WHERE slug='primeiros-socorros'), 'Antisséptico de uso geral.', 12.90, 8.90, 'CleanLab', 200, true, true, false, false, null),
  ('Antibiótico Genérico 500mg 21 cp', 'antibiotico-generico-500', (SELECT id FROM c WHERE slug='medicamentos'), 'Uso conforme prescrição médica.', 39.90, null, 'GenLab', 25, false, false, true, false, 'Vermelha'),
  ('Ansiolítico Controlado 30 cp', 'ansiolitico-controlado-30', (SELECT id FROM c WHERE slug='medicamentos'), 'Medicamento controlado. Venda mediante receita.', 49.90, null, 'PharmaPlus', 10, false, false, true, true, 'Preta'),
  ('Omeprazol 20mg Genérico 28 cp', 'omeprazol-20mg', (SELECT id FROM c WHERE slug='genericos'), 'Inibidor de bomba de prótons.', 18.90, 12.90, 'GenLab', 70, true, true, false, false, null);
