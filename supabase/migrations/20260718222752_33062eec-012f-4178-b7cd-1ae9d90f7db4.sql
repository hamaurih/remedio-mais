
DROP POLICY IF EXISTS admin_notifications_seller_select ON public.admin_notifications;
DROP POLICY IF EXISTS admin_notifications_seller_update ON public.admin_notifications;

CREATE POLICY admin_notifications_seller_select ON public.admin_notifications
FOR SELECT USING (
  has_role(auth.uid(), 'seller'::app_role) AND target_user_id = auth.uid()
);

CREATE POLICY admin_notifications_seller_update ON public.admin_notifications
FOR UPDATE USING (
  has_role(auth.uid(), 'seller'::app_role) AND target_user_id = auth.uid()
) WITH CHECK (
  has_role(auth.uid(), 'seller'::app_role) AND target_user_id = auth.uid()
);
