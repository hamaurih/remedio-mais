create or replace function public.get_trier_api_token_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.name = 'trier_api_token'
  limit 1
$$;

revoke all on function public.get_trier_api_token_secret() from public;
revoke all on function public.get_trier_api_token_secret() from anon;
revoke all on function public.get_trier_api_token_secret() from authenticated;
grant execute on function public.get_trier_api_token_secret() to service_role;
