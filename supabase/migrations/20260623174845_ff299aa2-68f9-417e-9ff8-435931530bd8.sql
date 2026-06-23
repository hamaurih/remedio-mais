
-- Restore public catalog visibility: grant SELECT on safe columns to anon and authenticated.
-- Previous migration revoked all privileges; site uses select=* and needs these columns.

DO $$
DECLARE
  cols text := 'id, name, slug, category_id, description, price, promo_price, image_url, '
            || 'manufacturer, active_ingredient, stock, featured, on_sale, requires_prescription, '
            || 'controlled, tarja, active, created_at, updated_at, shelves, short_description, '
            || 'sku, barcode, gallery_images, promotion_start, promotion_end, product_badge, '
            || 'custom_warning, seo_title, seo_description, seo_keywords, discount_percentage, '
            || 'laboratory, group_name, category_name, department_name, tags, cart_quantity_limit, '
            || 'has_variants, variation_type, bestseller_rank, is_generic, generic_equivalent_id, '
            || 'commercial_tags, show_in_menu, show_in_filters, site_price, site_promo_price, '
            || 'pix_discount_percentage, sale_observation, medicine_list_type';
BEGIN
  EXECUTE 'GRANT SELECT (' || cols || ') ON public.products TO anon';
  EXECUTE 'GRANT SELECT (' || cols || ') ON public.products TO authenticated';
END $$;

-- Admin/seller writes continue via RLS policies + service_role for edge functions.
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
