alter table public.seller_permissions
add column if not exists can_approve_prescriptions boolean not null default false;

comment on column public.seller_permissions.can_approve_prescriptions is
  'Allows a seller to approve or reject submitted prescriptions.';
