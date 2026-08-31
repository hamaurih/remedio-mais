create or replace function public.get_private_payment_secret(p_name text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_secret text;
begin
  if p_name not in ('CIELO_MERCHANT_ID','CIELO_MERCHANT_KEY') then
    raise exception 'secret_not_allowed';
  end if;
  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds
  where ds.name = p_name
  order by ds.updated_at desc nulls last, ds.created_at desc
  limit 1;
  return v_secret;
end;
$$;

create or replace function public.upsert_private_payment_secret(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_id uuid;
  v_value text := btrim(coalesce(p_value,''));
begin
  if p_name not in ('CIELO_MERCHANT_ID','CIELO_MERCHANT_KEY') then
    raise exception 'secret_not_allowed';
  end if;
  if length(v_value) < 8 or length(v_value) > 512 then
    raise exception 'invalid_secret_value';
  end if;
  select s.id into v_id
  from vault.secrets s
  where s.name = p_name
  order by s.updated_at desc nulls last, s.created_at desc
  limit 1;
  if v_id is null then
    perform vault.create_secret(v_value, p_name, 'Cielo API credential managed by secure admin flow');
  else
    perform vault.update_secret(v_id, v_value, p_name, 'Cielo API credential managed by secure admin flow');
  end if;
end;
$$;

create or replace function public.payment_secret_status()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, vault
as $$
  select jsonb_build_object(
    'merchant_id_configured', exists(select 1 from vault.secrets where name='CIELO_MERCHANT_ID'),
    'merchant_key_configured', exists(select 1 from vault.secrets where name='CIELO_MERCHANT_KEY')
  );
$$;

revoke all on function public.get_private_payment_secret(text) from public, anon, authenticated;
revoke all on function public.upsert_private_payment_secret(text,text) from public, anon, authenticated;
revoke all on function public.payment_secret_status() from public, anon, authenticated;
grant execute on function public.get_private_payment_secret(text) to service_role;
grant execute on function public.upsert_private_payment_secret(text,text) to service_role;
grant execute on function public.payment_secret_status() to service_role;
