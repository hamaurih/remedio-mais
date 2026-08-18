-- Prescription cart flow: securely bind a newly uploaded prescription to a cart product.
-- Additive migration; existing prescription/admin flows remain unchanged.

create index if not exists prescriptions_user_product_created_idx
  on public.prescriptions(user_id, product_id, created_at desc);

create or replace function public.bind_latest_prescription_to_product(
  _product_id uuid,
  _created_after timestamptz
)
returns table (
  id uuid,
  status text,
  approved_at timestamptz,
  product_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_prescription_id uuid;
begin
  if v_user_id is null then
    raise exception 'Não autenticado';
  end if;

  if _created_after is null or _created_after < now() - interval '15 minutes' then
    raise exception 'Janela de vinculação inválida';
  end if;

  if not exists (
    select 1
    from public.products p
    where p.id = _product_id
      and p.archived_at is null
      and (
        coalesce(p.requires_prescription, false)
        or coalesce(p.controlled, false)
        or nullif(trim(coalesce(p.medicine_list_type, '')), '') is not null
        or upper(coalesce(p.sale_observation, '')) like '%RECEITA%'
      )
  ) then
    raise exception 'Produto não exige receita ou não está disponível';
  end if;

  select pr.id
    into v_prescription_id
  from public.prescriptions pr
  where pr.user_id = v_user_id
    and pr.product_id is null
    and pr.created_at >= _created_after
    and pr.created_at <= now() + interval '1 minute'
  order by pr.created_at desc
  for update skip locked
  limit 1;

  if v_prescription_id is null then
    raise exception 'Receita recém-enviada não encontrada para vinculação';
  end if;

  update public.prescriptions pr
  set product_id = _product_id,
      updated_at = now()
  where pr.id = v_prescription_id;

  return query
  select pr.id, pr.status, pr.approved_at, pr.product_id
  from public.prescriptions pr
  where pr.id = v_prescription_id;
end;
$$;

revoke all on function public.bind_latest_prescription_to_product(uuid, timestamptz) from public, anon;
grant execute on function public.bind_latest_prescription_to_product(uuid, timestamptz) to authenticated;

-- Realtime is used only as a fast UI signal. RLS continues to restrict rows to
-- the owner/admin and polling remains as fallback in the storefront.
do $$
begin
  alter publication supabase_realtime add table public.prescriptions;
exception
  when duplicate_object then null;
end $$;
