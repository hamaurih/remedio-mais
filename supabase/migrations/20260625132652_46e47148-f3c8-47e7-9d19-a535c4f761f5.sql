
DROP POLICY "Sellers read order_events" ON public.order_events;
CREATE POLICY "Sellers read order_events" ON public.order_events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'seller'::app_role));

DROP POLICY "order_items_seller_update" ON public.order_items;
CREATE POLICY "order_items_seller_update" ON public.order_items
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'seller'::app_role) AND (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND COALESCE(o.payment_status, '') = ANY (ARRAY['approved','refunded','partially_refunded']))))
  WITH CHECK (has_role(auth.uid(), 'seller'::app_role) AND (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND COALESCE(o.payment_status, '') = ANY (ARRAY['approved','refunded','partially_refunded']))));
