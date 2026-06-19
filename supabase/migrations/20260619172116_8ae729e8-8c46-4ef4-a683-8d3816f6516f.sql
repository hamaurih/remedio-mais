DROP POLICY IF EXISTS "product_related public read" ON public.product_related;
CREATE POLICY "product_related public read" ON public.product_related
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p1 WHERE p1.id = product_related.product_id AND p1.active = true)
    AND
    EXISTS (SELECT 1 FROM public.products p2 WHERE p2.id = product_related.related_product_id AND p2.active = true)
  );

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  before jsonb,
  after jsonb,
  metadata jsonb
);

GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_admin_read ON public.admin_audit_log;
CREATE POLICY audit_admin_read ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS audit_admin_insert ON public.admin_audit_log;
CREATE POLICY audit_admin_insert ON public.admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx ON public.admin_audit_log (action);
CREATE INDEX IF NOT EXISTS admin_audit_log_entity_idx ON public.admin_audit_log (entity_type, entity_id);