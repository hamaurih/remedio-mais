
-- 1) Tighten order_items seller update to only orders they can view
DROP POLICY IF EXISTS order_items_seller_update ON public.order_items;
CREATE POLICY order_items_seller_update ON public.order_items
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'seller'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND COALESCE(o.payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded'])
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'seller'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND COALESCE(o.payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded'])
    )
  );

-- 2) Fix prescriptions storage owner_read so it matches when file_url contains a full URL or just the path
DROP POLICY IF EXISTS prescriptions_owner_read ON storage.objects;
CREATE POLICY prescriptions_owner_read ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'prescriptions'
    AND EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.user_id = auth.uid()
        AND (
          p.file_url = objects.name
          OR p.file_url LIKE '%/' || objects.name
          OR p.file_url LIKE '%/prescriptions/' || objects.name
        )
    )
  );
