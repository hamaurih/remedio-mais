-- The quote table remains inaccessible to browser roles. Edge Functions use service_role.
revoke all on table public.pos_delivery_quotes from public, anon, authenticated;
grant all on table public.pos_delivery_quotes to service_role;
