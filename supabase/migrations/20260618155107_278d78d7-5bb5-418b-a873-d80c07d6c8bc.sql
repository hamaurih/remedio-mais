
-- 1. Prescriptions: ownership-enforced INSERT and owner DELETE
CREATE POLICY "prescriptions_owner_insert" ON public.prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "prescriptions_owner_delete" ON public.prescriptions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 2. payment_errors: explicit service-role only insert policy (edge functions use service_role which bypasses RLS, but add explicit policy denying client inserts for clarity)
CREATE POLICY "payment_errors_service_insert" ON public.payment_errors
  FOR INSERT TO service_role
  WITH CHECK (true);

-- 3. products: revoke anon access to internal ERP/pricing columns
REVOKE SELECT (
  trier_product_id,
  trier_barcode,
  stock_quantity,
  ecommerce_price,
  ecommerce_stock_quantity,
  max_discount_percentage,
  trier_stock_quantity,
  mapping_status,
  price_origin,
  lock_manual_price,
  lock_manual_stock,
  minimum_stock,
  sync_with_trier,
  stock_origin
) ON public.products FROM anon;
