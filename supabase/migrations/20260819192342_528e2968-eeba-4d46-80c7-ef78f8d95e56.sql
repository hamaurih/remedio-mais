DROP POLICY IF EXISTS "stores readable by pos users" ON public.stores;
CREATE POLICY "stores readable by own operators"
ON public.stores FOR SELECT TO authenticated
USING (public.pos_is_operator(auth.uid(), stores.id));

DROP POLICY IF EXISTS "tenants readable by pos users" ON public.tenants;
CREATE POLICY "tenants readable by own operators"
ON public.tenants FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.pos_operators po
  JOIN public.stores s ON s.id = po.store_id
  WHERE po.user_id = auth.uid()
    AND po.active
    AND s.tenant_id = tenants.id
));