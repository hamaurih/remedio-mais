
-- 1) Remove bearer_token from trier_settings (use TRIER_API_TOKEN secret only)
ALTER TABLE public.trier_settings DROP COLUMN IF EXISTS bearer_token;

-- 2) Tighten orders insert policy with financial-field bounds
DROP POLICY IF EXISTS orders_authenticated_insert ON public.orders;
CREATE POLICY orders_authenticated_insert ON public.orders
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND payment_status = 'pending'
  AND order_status = 'aguardando_pagamento'
  AND trier_sent = false
  AND char_length(customer_name) BETWEEN 2 AND 120
  AND char_length(customer_phone) BETWEEN 8 AND 20
  AND total >= 0 AND total <= 100000
  AND COALESCE(subtotal, 0) >= 0 AND COALESCE(subtotal, 0) <= 100000
  AND COALESCE(discount, 0) >= 0 AND COALESCE(discount, 0) <= COALESCE(subtotal, total)
  AND COALESCE(delivery_fee, 0) >= 0 AND COALESCE(delivery_fee, 0) <= 500
  AND delivery_type = ANY (ARRAY['pickup','delivery'])
  AND (payment_method IS NULL OR payment_method = ANY (ARRAY['pix','credit_card']))
);

-- 3) Constrain prescriptions file_url to the expected uploaded path pattern
DROP POLICY IF EXISTS prescriptions_public_insert ON public.prescriptions;
CREATE POLICY prescriptions_public_insert ON public.prescriptions
FOR INSERT TO anon, authenticated
WITH CHECK (
  char_length(customer_name) BETWEEN 2 AND 120
  AND char_length(customer_phone) BETWEEN 8 AND 20
  AND (
    file_url IS NULL
    OR (char_length(file_url) <= 300 AND file_url ~ '^public/[0-9]+-[A-Za-z0-9._-]+$')
  )
  AND (notes IS NULL OR char_length(notes) <= 1000)
  AND status = 'recebida'
  AND internal_notes IS NULL
);
