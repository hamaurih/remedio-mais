-- Data API privileges are explicit so fresh Supabase projects keep working
-- after the 2026 change that stopped exposing new public tables by default.

begin;

grant select, update on table public.organizations to authenticated;
grant select, insert, update, delete on table public.stores to authenticated;
grant select, insert, update, delete on table public.organization_memberships to authenticated;
grant select on table public.organization_domains to anon;
grant select, insert, update, delete on table public.organization_domains to authenticated;
grant select on table public.plans to anon, authenticated;
grant select on table public.features to anon, authenticated;
grant select on table public.plan_features to anon, authenticated;
grant select on table public.subscriptions to authenticated;
grant select, insert, update, delete
  on table public.organization_feature_overrides
  to authenticated;
grant select, insert, update, delete
  on table public.organization_integrations
  to authenticated;

grant all privileges on table
  public.organizations,
  public.stores,
  public.organization_memberships,
  public.organization_domains,
  public.plans,
  public.features,
  public.plan_features,
  public.subscriptions,
  public.organization_feature_overrides,
  public.organization_integrations
to service_role;

commit;
