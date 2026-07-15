DROP POLICY IF EXISTS "home_layout_public_read" ON public.home_layout;
CREATE POLICY "home_layout_public_read" ON public.home_layout
  FOR SELECT USING (enabled = true OR public.has_role(auth.uid(), 'admin'));