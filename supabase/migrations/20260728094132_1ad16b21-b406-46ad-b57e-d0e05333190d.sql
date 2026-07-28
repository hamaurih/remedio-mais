UPDATE public.trier_settings SET auto_send_orders_enabled = true, updated_at = now() WHERE id = 1;

UPDATE public.trier_sync_jobs
   SET status = 'cancelled', finished_at = now(), error_message = COALESCE(error_message,'') || ' | cancelado na reorganizacao do agendador'
 WHERE status IN ('running','paused')
   AND started_at < now() - interval '30 minutes';