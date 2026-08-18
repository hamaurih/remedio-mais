-- The 90-day rotation baseline is complete. From now on a daily refresh is enough:
-- stock changes are handled separately every 15 minutes.
do $$
begin
  if exists (select 1 from cron.job where jobname='trier-rotation-sync-20m') then
    perform cron.unschedule('trier-rotation-sync-20m');
  end if;
  if exists (select 1 from cron.job where jobname='trier-rotation-daily') then
    perform cron.unschedule('trier-rotation-daily');
  end if;
end $$;

select cron.schedule(
  'trier-rotation-daily',
  '15 6 * * *',
  $$select public.invoke_trier_rotation_sync_internal(5);$$
);
