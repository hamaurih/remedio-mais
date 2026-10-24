
create or replace function public.admin_list_site_registrations()
returns table (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  cpf text,
  registered_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  account_role text,
  order_count bigint,
  paid_order_count bigint,
  total_spent numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, app_security
as $$
begin
  if auth.uid() is null
     or not app_security.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Acesso restrito a administradores'
      using errcode = '42501';
  end if;

  return query
  select
    u.id as user_id,
    coalesce(
      nullif(p.full_name, ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', '')
    ) as full_name,
    coalesce(nullif(p.email, ''), u.email) as email,
    p.phone,
    p.cpf,
    u.created_at as registered_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    coalesce(r.account_role, 'user') as account_role,
    count(o.id)::bigint as order_count,
    count(o.id) filter (where o.payment_status = 'approved')::bigint as paid_order_count,
    coalesce(
      sum(o.total) filter (where o.payment_status = 'approved'),
      0
    )::numeric as total_spent
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join lateral (
    select ur.role::text as account_role
    from public.user_roles ur
    where ur.user_id = u.id
    order by case ur.role::text
      when 'admin' then 1
      when 'seller' then 2
      else 3
    end
    limit 1
  ) r on true
  left join public.orders o on o.user_id = u.id
  group by
    u.id,
    p.full_name,
    p.email,
    p.phone,
    p.cpf,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.raw_user_meta_data,
    r.account_role
  order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_site_registrations() from public;
revoke all on function public.admin_list_site_registrations() from anon;
grant execute on function public.admin_list_site_registrations() to authenticated;
