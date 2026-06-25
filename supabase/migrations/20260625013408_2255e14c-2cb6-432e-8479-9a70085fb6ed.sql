DROP POLICY IF EXISTS orders_owner_insert ON public.orders;
CREATE POLICY orders_owner_insert ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);