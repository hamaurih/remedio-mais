
DROP POLICY IF EXISTS "Sellers read order_events" ON public.order_events;
CREATE POLICY "Sellers read order_events" ON public.order_events
FOR SELECT USING (
  has_role(auth.uid(), 'seller'::app_role) AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_events.order_id
      AND COALESCE(o.payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded'])
  )
);

DROP POLICY IF EXISTS "refund_requests_seller_view" ON public.refund_requests;
CREATE POLICY "refund_requests_seller_view" ON public.refund_requests
FOR SELECT USING (
  has_role(auth.uid(), 'seller'::app_role) AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = refund_requests.order_id
      AND COALESCE(o.payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded'])
  )
);

DROP POLICY IF EXISTS "refund_items_seller_view" ON public.refund_items;
CREATE POLICY "refund_items_seller_view" ON public.refund_items
FOR SELECT USING (
  has_role(auth.uid(), 'seller'::app_role) AND EXISTS (
    SELECT 1 FROM public.refund_requests rr
    JOIN public.orders o ON o.id = rr.order_id
    WHERE rr.id = refund_items.refund_request_id
      AND COALESCE(o.payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded'])
  )
);
