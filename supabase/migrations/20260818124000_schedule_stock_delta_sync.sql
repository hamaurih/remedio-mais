-- Keep stock fresh without rescanning the catalog.
-- Runs between priority and rotation jobs to avoid unnecessary concurrency.

do $$
begin
  if exists (select 1 from cron.job where jobname='trier-stock-delta-15m') then
    perform cron.unschedule('trier-stock-delta-15m');
  end if;
end $$;

select cron.schedule(
  'trier-stock-delta-15m',
  '2,17,32,47 * * * *',
  $$select public.invoke_trier_stock_delta_internal(5);$$
);
