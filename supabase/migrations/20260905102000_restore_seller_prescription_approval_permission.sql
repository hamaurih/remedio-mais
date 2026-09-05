-- Restore schema contract used by prescription submission/notification flow.
-- The application and fanout_operational_notification() reference this permission,
-- but the production database lost the column during the restore/migration sequence.

ALTER TABLE public.seller_permissions
  ADD COLUMN IF NOT EXISTS can_approve_prescriptions boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.seller_permissions.can_approve_prescriptions IS
  'Controls whether a seller may approve/review prescriptions; kept false by default and granted explicitly.';
