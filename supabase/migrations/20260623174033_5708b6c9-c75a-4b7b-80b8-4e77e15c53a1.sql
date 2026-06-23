
-- =========================================================
-- 1) customer_addresses: restrict seller SELECT to addresses
--    of customers tied to orders they may handle.
-- =========================================================
DROP POLICY IF EXISTS customer_addresses_seller_select ON public.customer_addresses;

CREATE POLICY customer_addresses_seller_select
  ON public.customer_addresses
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'seller'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.user_id = customer_addresses.customer_id
        AND COALESCE(o.payment_status, '') = ANY (ARRAY['approved','refunded','partially_refunded'])
    )
  );

-- =========================================================
-- 2) orders_seller_update: tighten WITH CHECK so the row
--    must remain in an allowed payment_status after update.
--    Financial fields are also blocked by guard_seller_order_update trigger.
-- =========================================================
DROP POLICY IF EXISTS orders_seller_update ON public.orders;

CREATE POLICY orders_seller_update
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'seller'::app_role)
    AND COALESCE(payment_status, '') = ANY (ARRAY['approved','refunded','partially_refunded'])
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'seller'::app_role)
    AND COALESCE(payment_status, '') = ANY (ARRAY['approved','refunded','partially_refunded'])
  );

-- =========================================================
-- 3) products: revoke table-wide privileges from anon/authenticated
--    so internal ERP/operational columns are no longer readable.
--    Re-grant SELECT only on the curated public-facing columns.
--    Admin writes still work because admins authenticate as `authenticated`
--    and pass the products_admin_write RLS policy; column-level INSERT/UPDATE/DELETE
--    grants are restored for the same public columns plus internal ones the
--    admin UI manages.
-- =========================================================
REVOKE ALL ON TABLE public.products FROM anon, authenticated;

-- Public-readable columns (catalog display)
GRANT SELECT (
  id, name, slug, category_id, description, price, promo_price,
  image_url, manufacturer, active_ingredient, stock, featured, on_sale,
  requires_prescription, controlled, tarja, active, created_at, updated_at,
  shelves, short_description, sku, barcode, gallery_images,
  promotion_start, promotion_end, product_badge, custom_warning,
  seo_title, seo_description, seo_keywords, discount_percentage,
  ecommerce_name, laboratory, group_name, category_name, department_name,
  sale_observation, medicine_list_type, tags, cart_quantity_limit,
  pix_discount_percentage, manual_image, manual_description,
  has_variants, variation_type, bestseller_rank,
  is_generic, generic_equivalent_id, site_price, site_promo_price
) ON public.products TO anon, authenticated;

-- Authenticated admins need DML to manage catalog; the products_admin_write
-- RLS policy still restricts who actually writes.
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;

-- service_role (edge functions / Trier sync) keeps full access
GRANT ALL ON public.products TO service_role;
