DROP POLICY IF EXISTS "Vitrines visíveis publicamente" ON public.home_shelf_items;

CREATE POLICY "Vitrines visíveis publicamente"
ON public.home_shelf_items
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = home_shelf_items.product_id
      AND p.active = true
      AND p.archived_at IS NULL
  )
);

DROP POLICY IF EXISTS admin_notifications_seller_select ON public.admin_notifications;
DROP POLICY IF EXISTS admin_notifications_seller_update ON public.admin_notifications;

CREATE POLICY admin_notifications_seller_select
ON public.admin_notifications
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'seller'::app_role) AND target_user_id = auth.uid());

CREATE POLICY admin_notifications_seller_update
ON public.admin_notifications
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'seller'::app_role) AND target_user_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'seller'::app_role) AND target_user_id = auth.uid());

REVOKE ALL ON public.admin_notifications FROM anon;
REVOKE ALL ON public.orders FROM anon;