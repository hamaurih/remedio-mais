-- INC-2026-10-31 / checkout Pix: CRM opportunity insert must run after cart link.
-- PostgreSQL executes AFTER triggers alphabetically by name.
-- Previously the CRM order trigger ran before the cart funnel linkage and
-- created a second opportunity for an existing cart. The session trigger
-- then hit crm_opportunities_tenant_cart_uq and aborted payment order inserts.
-- Only reorder the CRM observer; keep all payment, stock, Trier, and ERP rules.
ALTER TRIGGER trg_crm_sync_order ON public.orders RENAME TO trg_z_crm_sync_order;
