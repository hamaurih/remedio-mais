-- Generate the temporary bootstrap key inside Supabase Vault so the plaintext
-- never needs to be written to GitHub, chat, CI or client code.

do $$
begin
  if not exists (select 1 from vault.secrets where name='trier_bootstrap_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'trier_bootstrap_key',
      'Chave interna temporaria para bootstrap Trier em homologacao'
    );
  end if;
end $$;

create or replace function public.get_trier_bootstrap_key_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.name = 'trier_bootstrap_key'
  limit 1
$$;

revoke all on function public.get_trier_bootstrap_key_secret() from public, anon, authenticated;
grant execute on function public.get_trier_bootstrap_key_secret() to service_role;
