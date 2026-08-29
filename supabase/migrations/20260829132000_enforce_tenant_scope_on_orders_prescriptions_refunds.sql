DROP POLICY IF EXISTS "orders_owner_insert" ON public.orders;
REVOKE INSERT ON public.orders FROM authenticated;

DROP POLICY IF EXISTS "orders_admin_read" ON public.orders;
CREATE POLICY "orders_admin_read" ON public.orders FOR SELECT TO authenticated
USING (private.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin','manager']) OR public.is_platform_staff(auth.uid()));

DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;
CREATE POLICY "orders_admin_update" ON public.orders FOR UPDATE TO authenticated
USING (private.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin','manager']) OR public.is_platform_staff(auth.uid()))
WITH CHECK (private.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin','manager']) OR public.is_platform_staff(auth.uid()));

DROP POLICY IF EXISTS "orders_admin_delete" ON public.orders;
CREATE POLICY "orders_admin_delete" ON public.orders FOR DELETE TO authenticated
USING (private.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin','manager']) OR public.is_platform_staff(auth.uid()));

DROP POLICY IF EXISTS "orders_seller_select" ON public.orders;
CREATE POLICY "orders_seller_select" ON public.orders FOR SELECT TO authenticated
USING (private.has_tenant_role(tenant_id, auth.uid(), ARRAY['seller']) AND COALESCE(payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded']));

DROP POLICY IF EXISTS "orders_seller_update" ON public.orders;
CREATE POLICY "orders_seller_update" ON public.orders FOR UPDATE TO authenticated
USING (private.has_tenant_role(tenant_id, auth.uid(), ARRAY['seller']) AND COALESCE(payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded']))
WITH CHECK (private.has_tenant_role(tenant_id, auth.uid(), ARRAY['seller']) AND COALESCE(payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded']));

DROP POLICY IF EXISTS "order_items_admin_read" ON public.order_items;
CREATE POLICY "order_items_admin_read" ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND (private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['owner','admin','manager']) OR public.is_platform_staff(auth.uid()))));

DROP POLICY IF EXISTS "order_items_seller_select" ON public.order_items;
CREATE POLICY "order_items_seller_select" ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['seller']) AND COALESCE(o.payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded'])));

DROP POLICY IF EXISTS "order_items_seller_update" ON public.order_items;
CREATE POLICY "order_items_seller_update" ON public.order_items FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['seller']) AND COALESCE(o.payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded'])))
WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['seller']) AND COALESCE(o.payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded'])));

DROP POLICY IF EXISTS "Admins manage order_events" ON public.order_events;
CREATE POLICY "Admins manage order_events" ON public.order_events FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_events.order_id AND (private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['owner','admin','manager']) OR public.is_platform_staff(auth.uid()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_events.order_id AND (private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['owner','admin','manager']) OR public.is_platform_staff(auth.uid()))));

DROP POLICY IF EXISTS "Sellers read order_events" ON public.order_events;
CREATE POLICY "Sellers read order_events" ON public.order_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_events.order_id AND private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['seller']) AND COALESCE(o.payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded'])));

DROP POLICY IF EXISTS "prescriptions_owner_insert" ON public.prescriptions;
REVOKE INSERT ON public.prescriptions FROM authenticated;

DROP POLICY IF EXISTS "prescriptions_admin_read" ON public.prescriptions;
CREATE POLICY "prescriptions_admin_read" ON public.prescriptions FOR SELECT TO authenticated
USING (private.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin','manager','pharmacist']) OR public.is_platform_staff(auth.uid()));

DROP POLICY IF EXISTS "prescriptions_admin_update" ON public.prescriptions;
CREATE POLICY "prescriptions_admin_update" ON public.prescriptions FOR UPDATE TO authenticated
USING (private.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin','manager','pharmacist']) OR public.is_platform_staff(auth.uid()))
WITH CHECK (private.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin','manager','pharmacist']) OR public.is_platform_staff(auth.uid()));

DROP POLICY IF EXISTS "Sellers with permission can read prescriptions" ON public.prescriptions;
CREATE POLICY "Sellers with permission can read prescriptions" ON public.prescriptions FOR SELECT TO authenticated
USING (private.has_tenant_role(tenant_id, auth.uid(), ARRAY['seller']) AND EXISTS (SELECT 1 FROM public.seller_permissions sp WHERE sp.user_id = auth.uid() AND sp.can_view_prescriptions = true));

DROP POLICY IF EXISTS "Admins manage stock_movements" ON public.stock_movements;
CREATE POLICY "Admins manage stock_movements" ON public.stock_movements FOR ALL TO authenticated
USING (private.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin','manager','inventory']) OR public.is_platform_staff(auth.uid()))
WITH CHECK (private.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin','manager','inventory']) OR public.is_platform_staff(auth.uid()));

DROP POLICY IF EXISTS "refund_requests_admin_all" ON public.refund_requests;
CREATE POLICY "refund_requests_admin_all" ON public.refund_requests FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = refund_requests.order_id AND (private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['owner','admin','manager']) OR public.is_platform_staff(auth.uid()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = refund_requests.order_id AND (private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['owner','admin','manager']) OR public.is_platform_staff(auth.uid()))));

DROP POLICY IF EXISTS "refund_requests_seller_view" ON public.refund_requests;
CREATE POLICY "refund_requests_seller_view" ON public.refund_requests FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = refund_requests.order_id AND private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['seller']) AND COALESCE(o.payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded'])));

DROP POLICY IF EXISTS "refund_requests_seller_insert" ON public.refund_requests;
CREATE POLICY "refund_requests_seller_insert" ON public.refund_requests FOR INSERT TO authenticated
WITH CHECK (requested_by = auth.uid() AND status = 'pending' AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = refund_requests.order_id AND private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['seller']) AND COALESCE(o.payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded'])));

DROP POLICY IF EXISTS "refund_items_admin_all" ON public.refund_items;
CREATE POLICY "refund_items_admin_all" ON public.refund_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.refund_requests rr JOIN public.orders o ON o.id = rr.order_id WHERE rr.id = refund_items.refund_request_id AND (private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['owner','admin','manager']) OR public.is_platform_staff(auth.uid()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.refund_requests rr JOIN public.orders o ON o.id = rr.order_id WHERE rr.id = refund_items.refund_request_id AND (private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['owner','admin','manager']) OR public.is_platform_staff(auth.uid()))));

DROP POLICY IF EXISTS "refund_items_seller_view" ON public.refund_items;
CREATE POLICY "refund_items_seller_view" ON public.refund_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.refund_requests rr JOIN public.orders o ON o.id = rr.order_id WHERE rr.id = refund_items.refund_request_id AND private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['seller']) AND COALESCE(o.payment_status,'') = ANY (ARRAY['approved','refunded','partially_refunded'])));

DROP POLICY IF EXISTS "refund_items_seller_insert" ON public.refund_items;
CREATE POLICY "refund_items_seller_insert" ON public.refund_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.refund_requests rr JOIN public.orders o ON o.id = rr.order_id WHERE rr.id = refund_items.refund_request_id AND rr.requested_by = auth.uid() AND rr.status = 'pending' AND private.has_tenant_role(o.tenant_id, auth.uid(), ARRAY['seller'])));
