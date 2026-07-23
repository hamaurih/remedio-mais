UPDATE public.trier_sync_jobs
SET status = 'cancelled',
    finished_at = now(),
    error_message = COALESCE(error_message,'') || ' | cancelado_manual_pos_arquivamento'
WHERE status IN ('running','paused')
  AND sync_type IN ('products','discounts');