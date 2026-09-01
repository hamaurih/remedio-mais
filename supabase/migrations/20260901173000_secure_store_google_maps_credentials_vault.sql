create or replace function public.get_private_store_integration_secret(
  p_store_settings_id bigint,
  p_provider text,
  p_key text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_name text;
  v_secret text;
begin
  if p_store_settings_id is null or p_store_settings_id < 1 then
    raise exception 'invalid_store_settings_id';
  end if;
  if p_provider <> 'google_maps' or p_key <> 'server_api_key' then
    raise exception 'secret_not_allowed';
  end if;

  v_name := format('STORE_%s_GOOGLE_MAPS_SERVER_API_KEY', p_store_settings_id);

  select ds.decrypted_secret
    into v_secret
  from vault.decrypted_secrets ds
  where ds.name = v_name
  order by ds.updated_at desc nulls last, ds.created_at desc
  limit 1;

  return v_secret;
end;
$$;

create or replace function public.upsert_private_store_integration_secret(
  p_store_settings_id bigint,
  p_provider text,
  p_key text,
  p_value text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_name text;
  v_id uuid;
  v_value text := btrim(coalesce(p_value, ''));
begin
  if p_store_settings_id is null or p_store_settings_id < 1 then
    raise exception 'invalid_store_settings_id';
  end if;
  if p_provider <> 'google_maps' or p_key <> 'server_api_key' then
    raise exception 'secret_not_allowed';
  end if;
  if length(v_value) < 20 or length(v_value) > 512 then
    raise exception 'invalid_secret_value';
  end if;

  v_name := format('STORE_%s_GOOGLE_MAPS_SERVER_API_KEY', p_store_settings_id);

  select s.id
    into v_id
  from vault.secrets s
  where s.name = v_name
  order by s.updated_at desc nulls last, s.created_at desc
  limit 1;

  if v_id is null then
    perform vault.create_secret(
      v_value,
      v_name,
      format('Google Maps server API key for store_settings id %s', p_store_settings_id)
    );
  else
    perform vault.update_secret(
      v_id,
      v_value,
      v_name,
      format('Google Maps server API key for store_settings id %s', p_store_settings_id)
    );
  end if;
end;
$$;

create or replace function public.store_integration_secret_status(
  p_store_settings_id bigint,
  p_provider text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_name text;
  v_updated_at timestamptz;
begin
  if p_store_settings_id is null or p_store_settings_id < 1 then
    raise exception 'invalid_store_settings_id';
  end if;
  if p_provider <> 'google_maps' then
    raise exception 'provider_not_allowed';
  end if;

  v_name := format('STORE_%s_GOOGLE_MAPS_SERVER_API_KEY', p_store_settings_id);

  select s.updated_at
    into v_updated_at
  from vault.secrets s
  where s.name = v_name
  order by s.updated_at desc nulls last, s.created_at desc
  limit 1;

  return jsonb_build_object(
    'configured', v_updated_at is not null,
    'updated_at', v_updated_at
  );
end;
$$;

revoke all on function public.get_private_store_integration_secret(bigint,text,text) from public, anon, authenticated;
revoke all on function public.upsert_private_store_integration_secret(bigint,text,text,text) from public, anon, authenticated;
revoke all on function public.store_integration_secret_status(bigint,text) from public, anon, authenticated;

grant execute on function public.get_private_store_integration_secret(bigint,text,text) to service_role;
grant execute on function public.upsert_private_store_integration_secret(bigint,text,text,text) to service_role;
grant execute on function public.store_integration_secret_status(bigint,text) to service_role;
