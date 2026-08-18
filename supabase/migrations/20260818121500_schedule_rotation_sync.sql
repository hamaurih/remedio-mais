-- Continue the 90-day rotation baseline in small resumable batches.
-- Once current, the Edge Function returns a no-op until a new day needs ingestion.

do $$
begin
  if exists (select 1 from cron.job where jobname='trier-rotation-sync-20m') then
    perform cron.unschedule('trier-rotation-sync-20m');
  end if;
end $$;

select cron.schedule(
  'trier-rotation-sync-20m',
  '5,25,45 * * * *',
  $$select public.invoke_trier_rotation_sync_internal(5);$$
);
