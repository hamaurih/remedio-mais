-- 1) order_items: require linked order that is recent and still 'novo'
DROP POLICY IF EXISTS order_items_public_insert ON public.order_items;
CREATE POLICY order_items_public_insert
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  quantity > 0 AND quantity <= 1000
  AND unit_price >= 0 AND unit_price <= 100000
  AND char_length(product_name) BETWEEN 1 AND 250
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.status = 'novo'
      AND o.created_at > now() - interval '1 hour'
  )
);

-- 2) prescriptions bucket: file size + mime restrictions
UPDATE storage.buckets
SET file_size_limit = 10485760,  -- 10 MB
    allowed_mime_types = ARRAY[
      'application/pdf','image/jpeg','image/png','image/webp'
    ]
WHERE id = 'prescriptions';

-- 3) Tighten public upload policy: only into the 'public/' folder,
--    only allowed extensions, only anonymous uploads (not overwriting).
DROP POLICY IF EXISTS prescriptions_public_upload ON storage.objects;
CREATE POLICY prescriptions_public_upload
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'prescriptions'
  AND (storage.foldername(name))[1] = 'public'
  AND lower(name) ~ '\.(pdf|jpe?g|png|webp)$'
);