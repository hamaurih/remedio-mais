create index if not exists idx_prescription_email_log_status_lookup
  on public.prescription_email_log (prescription_id, status, created_at desc);
