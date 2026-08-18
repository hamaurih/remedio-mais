-- Full Trier baseline completed (55,324 records). Retire the temporary
-- full-catalog bootstrap so routine operations cannot accidentally rescan it.

do $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name='trier_bootstrap_key' limit 1;
  if v_id is not null then
    perform vault.update_secret(
      v_id,
      encode(gen_random_bytes(32),'hex'),
      'trier_bootstrap_key_retired_20260818',
      'Retired after initial Trier baseline import'
    );
  end if;
end $$;

drop function if exists public.invoke_trier_bootstrap_internal(integer,integer);
drop function if exists public.get_trier_bootstrap_key_secret();
drop function if exists public.bootstrap_ingest_trier_products(jsonb);
