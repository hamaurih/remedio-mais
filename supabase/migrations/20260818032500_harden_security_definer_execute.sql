-- Security hardening for functions exposed through the public API schema.
--
-- Principles:
-- 1) Trigger-only functions must never be callable directly as RPC endpoints.
-- 2) Admin and POS RPCs remain callable by authenticated users because the
--    frontend uses them directly; authorization is enforced inside each RPC.
-- 3) Anonymous callers must not execute admin/POS RPCs.
-- 4) has_role() is intentionally unchanged because existing RLS policies,
--    including policies for the public role, depend on it.
-- 5) public_bestsellers() and public_meta_config() are intentionally public
--    projections and are therefore unchanged.

-- ---------------------------------------------------------------------------
-- Trigger-only SECURITY DEFINER functions: database-internal only.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.audit_order_sensitive_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_refund_request_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_seller_order_item_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_seller_order_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_item_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_status_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_product_price_change() FROM PUBLIC, anon, authenticated;

-- Keep privileged backend access explicit. Trigger execution itself does not
-- depend on the invoking SQL role having direct EXECUTE privilege.
GRANT EXECUTE ON FUNCTION public.audit_order_sensitive_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_refund_request_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_seller_order_item_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_seller_order_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_order_created() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_order_item_status_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_order_status_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_product_price_change() TO service_role;

-- ---------------------------------------------------------------------------
-- Admin RPCs: signed-in entry point + internal role checks.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_archive_apply(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_archive_preview(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_bestsellers_diagnostic(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_invite_seller(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_sellers() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_product_detail(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_products_list(text, uuid, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_seller(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_taxonomy_rows(uuid[], boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_unarchive_product(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_archive_apply(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_archive_preview(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_bestsellers_diagnostic(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_invite_seller(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_sellers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_product_detail(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_products_list(text, uuid, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_seller(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_taxonomy_rows(uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_unarchive_product(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- POS client RPCs: required by the authenticated PDV frontend, never anonymous.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.pos_cash_movement(uuid, public.pos_movement_type, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pos_close_session(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pos_finalize_sale(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pos_open_session(uuid, numeric) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pos_cash_movement(uuid, public.pos_movement_type, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pos_close_session(uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pos_finalize_sale(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pos_open_session(uuid, numeric) TO authenticated, service_role;

-- POS authorization helpers are used by authenticated RLS policies. Preserve
-- authenticated access but remove anonymous RPC exposure.
REVOKE EXECUTE ON FUNCTION public.pos_effective_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pos_is_operator(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pos_max_discount(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pos_effective_role(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pos_is_operator(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pos_max_discount(uuid, uuid) TO authenticated, service_role;
