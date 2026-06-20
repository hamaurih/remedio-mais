
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='refund_requests_idempotency_key_key') THEN
    ALTER TABLE public.refund_requests
      ADD CONSTRAINT refund_requests_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $$;
