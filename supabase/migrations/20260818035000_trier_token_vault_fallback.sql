-- Secure fallback for the Trier API token.
-- The secret value itself is NEVER versioned. It is stored in Supabase Vault
-- under the name `trier_api_token` and can only be read through this RPC by service_role.

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
