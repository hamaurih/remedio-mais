-- 1) PRODUCTS: column-level SELECT for anon
-- Table-level SELECT overrides column REVOKEs, so we must remove table SELECT
-- from anon and re-grant only the safe storefront columns.
REVOKE SELECT ON public.products FROM anon;

GRANT SELECT (
  id, name, slug, category_id, description, price, promo_price, image_url,
  manufacturer, active_ingredient, stock, featured, on_sale,
  requires_prescription, controlled, tarja, active, created_at, updated_at,
  shelves, short_description, sku, barcode, gallery_images,
  promotion_start, promotion_end, product_badge, custom_warning,
  seo_title, seo_description, seo_keywords, discount_percentage,
  trier_product_id, ecommerce_name, laboratory, group_name,
  category_name, department_name, tags, cart_quantity_limit,
  pix_discount_percentage, manual_image, manual_description,
  has_variants, variation_type, bestseller_rank, is_generic,
  generic_equivalent_id, sale_observation, medicine_list_type, is_active
) ON public.products TO anon;

-- 2) PAYMENT_SETTINGS: explicit lockdown for anon
REVOKE ALL ON public.payment_settings FROM anon;

-- 3) TRIER_SETTINGS: explicit lockdown for anon
REVOKE ALL ON public.trier_settings FROM anon;