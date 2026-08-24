-- Gate seller refund inserts on seller_permissions.can_request_refund

DROP POLICY IF EXISTS refund_requests_seller_insert ON public.refund_requests;
CREATE POLICY refund_requests_seller_insert
ON public.refund_requests
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'seller'::app_role)
  AND requested_by = auth.uid()
  AND status = 'pending'::text
  AND EXISTS (
    SELECT 1 FROM public.seller_permissions sp
    WHERE sp.user_id = auth.uid()
      AND sp.can_request_refund = true
  )
);

DROP POLICY IF EXISTS refund_items_seller_insert ON public.refund_items;
CREATE POLICY refund_items_seller_insert
ON public.refund_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'seller'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.refund_requests rr
    WHERE rr.id = refund_items.refund_request_id
      AND rr.requested_by = auth.uid()
      AND rr.status = 'pending'::text
  )
  AND EXISTS (
    SELECT 1 FROM public.seller_permissions sp
    WHERE sp.user_id = auth.uid()
      AND sp.can_request_refund = true
  )
);