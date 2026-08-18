-- Staging-safe recurring priority sync.
-- No full-catalog scan: only products due in product_sync_priority are queried.
-- Conservative batch while Trier/SGF stability and contractual rate limits are observed.

do $$
begin
  if exists (select 1 from cron.job where jobname='trier-priority-sync-10m') then
    perform cron.unschedule('trier-priority-sync-10m');
  end if;
end $$;

select cron.schedule(
  'trier-priority-sync-10m',
  '*/10 * * * *',
  $$select public.invoke_trier_priority_sync_internal(80);$$
);
