DROP POLICY IF EXISTS "banners_public_read" ON public.banners;
CREATE POLICY "banners_public_read" ON public.banners FOR SELECT TO public USING (active = true);

DROP POLICY IF EXISTS "campaigns_public_read" ON public.campaigns;
CREATE POLICY "campaigns_public_read" ON public.campaigns FOR SELECT TO public
USING (active = true AND published = true AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now()));

DROP POLICY IF EXISTS "campaign_products_public_read" ON public.campaign_products;
CREATE POLICY "campaign_products_public_read" ON public.campaign_products FOR SELECT TO public
USING (EXISTS (
  SELECT 1 FROM public.campaigns c
  WHERE c.id = campaign_products.campaign_id
    AND c.active = true AND c.published = true
    AND (c.starts_at IS NULL OR c.starts_at <= now())
    AND (c.ends_at IS NULL OR c.ends_at >= now())
));

DROP POLICY IF EXISTS "categories_public_read" ON public.categories;
CREATE POLICY "categories_public_read" ON public.categories FOR SELECT TO public USING (active = true);

DROP POLICY IF EXISTS "home_layout_public_read" ON public.home_layout;
CREATE POLICY "home_layout_public_read" ON public.home_layout FOR SELECT TO public USING (enabled = true);

DROP POLICY IF EXISTS "mosaic_public_read" ON public.home_mosaic_tiles;
CREATE POLICY "mosaic_public_read" ON public.home_mosaic_tiles FOR SELECT TO public USING (active = true);

DROP POLICY IF EXISTS "Anyone can view active variants" ON public.product_variants;
CREATE POLICY "Anyone can view active variants" ON public.product_variants FOR SELECT TO public USING (active = true);

DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read" ON public.products FOR SELECT TO public USING (active = true);

DROP POLICY IF EXISTS "promo_blocks_public_read" ON public.promo_banner_blocks;
CREATE POLICY "promo_blocks_public_read" ON public.promo_banner_blocks FOR SELECT TO public USING (active = true);

DROP POLICY IF EXISTS "Sellers read order_events" ON public.order_events;
CREATE POLICY "Sellers read order_events" ON public.order_events FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'seller'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_events.order_id
      AND COALESCE(o.payment_status, '') = ANY (ARRAY['approved','refunded','partially_refunded'])
  )
);

DROP POLICY IF EXISTS "refund_requests_seller_view" ON public.refund_requests;
CREATE POLICY "refund_requests_seller_view" ON public.refund_requests FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'seller'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = refund_requests.order_id
      AND COALESCE(o.payment_status, '') = ANY (ARRAY['approved','refunded','partially_refunded'])
  )
);

DROP POLICY IF EXISTS "refund_items_seller_view" ON public.refund_items;
CREATE POLICY "refund_items_seller_view" ON public.refund_items FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'seller'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.refund_requests rr
    JOIN public.orders o ON o.id = rr.order_id
    WHERE rr.id = refund_items.refund_request_id
      AND COALESCE(o.payment_status, '') = ANY (ARRAY['approved','refunded','partially_refunded'])
  )
);

DROP POLICY IF EXISTS "user_roles_no_self_delete" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_no_self_insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_no_self_update" ON public.user_roles;

REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.customer_addresses FROM anon;
REVOKE ALL ON TABLE public.orders FROM anon;
REVOKE ALL ON TABLE public.order_items FROM anon;
REVOKE ALL ON TABLE public.prescriptions FROM anon;
REVOKE ALL ON TABLE public.prescription_regulatory FROM anon;
REVOKE ALL ON TABLE public.prescription_audit_events FROM anon;
REVOKE ALL ON TABLE public.payment_errors FROM anon;
REVOKE ALL ON TABLE public.refund_requests FROM anon;
REVOKE ALL ON TABLE public.refund_items FROM anon;
REVOKE ALL ON TABLE public.user_roles FROM anon;
REVOKE ALL ON TABLE public.seller_permissions FROM anon;
REVOKE ALL ON TABLE public.tenant_memberships FROM anon;
REVOKE ALL ON TABLE public.platform_members FROM anon;
REVOKE ALL ON TABLE public.auth_login_attempts FROM anon, authenticated;
