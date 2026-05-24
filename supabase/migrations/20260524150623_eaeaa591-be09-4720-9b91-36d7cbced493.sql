
-- 1) touch_updated_at search_path
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 2) Restrict SECURITY DEFINER function execution
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3) Move pg_net out of public (drop + recreate in extensions schema)
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- 4) Validation on public inserts
DROP POLICY IF EXISTS orders_public_insert ON public.orders;
CREATE POLICY orders_public_insert ON public.orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    char_length(customer_name) BETWEEN 2 AND 120
    AND char_length(customer_phone) BETWEEN 8 AND 20
    AND (customer_address IS NULL OR char_length(customer_address) <= 500)
    AND delivery_method IN ('pickup','delivery')
    AND status = 'novo'
    AND total >= 0 AND total <= 100000
    AND trier_sent = false
    AND trier_sent_at IS NULL
    AND trier_status IS NULL
    AND trier_numero_nota IS NULL
    AND (notes IS NULL OR char_length(notes) <= 1000)
  );

DROP POLICY IF EXISTS order_items_public_insert ON public.order_items;
CREATE POLICY order_items_public_insert ON public.order_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    quantity > 0 AND quantity <= 1000
    AND unit_price >= 0 AND unit_price <= 100000
    AND char_length(product_name) BETWEEN 1 AND 250
  );

DROP POLICY IF EXISTS prescriptions_public_insert ON public.prescriptions;
CREATE POLICY prescriptions_public_insert ON public.prescriptions
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    char_length(customer_name) BETWEEN 2 AND 120
    AND char_length(customer_phone) BETWEEN 8 AND 20
    AND (file_url IS NULL OR char_length(file_url) <= 1000)
    AND (notes IS NULL OR char_length(notes) <= 1000)
    AND status = 'recebida'
    AND internal_notes IS NULL
  );

-- 5) Lock store_settings, expose safe public view
REVOKE ALL ON public.store_settings FROM anon;
DROP POLICY IF EXISTS settings_public_read ON public.store_settings;
CREATE POLICY settings_admin_read ON public.store_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE VIEW public.store_settings_public
WITH (security_invoker = true) AS
SELECT id, store_name, whatsapp, address, instagram, hours, delivery_fee,
  served_neighborhoods, hero_title, hero_subtitle, footer_text, sanitary_notice,
  legal_name, cnpj, pharmacist_name, crf, sanitary_license, afe,
  pix_discount_enabled, pix_discount_percentage, updated_at
FROM public.store_settings;
GRANT SELECT ON public.store_settings_public TO anon, authenticated;
