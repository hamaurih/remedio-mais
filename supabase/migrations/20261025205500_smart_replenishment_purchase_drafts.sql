create or replace function public.create_smart_purchase_drafts(_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_tenant_id uuid;
  v_store_id uuid;
  v_supplier_id uuid;
  v_order_id uuid;
  v_order_number bigint;
  v_orders jsonb := '[]'::jsonb;
  v_order_count integer := 0;
  v_item_count integer := 0;
  v_invalid_count integer;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Apenas administradores podem gerar pedidos pela reposição inteligente';
  end if;

  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then
    raise exception 'Selecione pelo menos um item para gerar o pedido';
  end if;

  if jsonb_array_length(_items) > 200 then
    raise exception 'Limite de 200 itens por geração de pedidos';
  end if;

  select tm.tenant_id, coalesce(member_store.id, headquarters.id)
    into v_tenant_id, v_store_id
  from public.tenant_memberships tm
  left join public.stores member_store
    on member_store.id = tm.store_id
  left join lateral (
    select st.id
    from public.stores st
    where st.tenant_id = tm.tenant_id
      and st.active = true
    order by st.is_headquarters desc nulls last, st.created_at asc
    limit 1
  ) headquarters on true
  where tm.user_id = auth.uid()
    and tm.active = true
  order by case when tm.role::text in ('owner','admin') then 0 else 1 end, tm.created_at asc
  limit 1;

  if v_tenant_id is null or v_store_id is null then
    raise exception 'Administrador sem vínculo ativo com uma unidade';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant_id::text || ':smart-purchase', 0));

  with requested as (
    select
      x.product_id,
      x.supplier_id,
      x.quantity
    from jsonb_to_recordset(_items) as x(product_id uuid, supplier_id uuid, quantity numeric)
  )
  select count(*) into v_invalid_count
  from requested r
  left join public.products p on p.id = r.product_id
  left join public.supplier_products sp
    on sp.tenant_id = v_tenant_id
   and sp.product_id = r.product_id
   and sp.supplier_id = r.supplier_id
  left join public.suppliers s
    on s.id = r.supplier_id
   and s.tenant_id = v_tenant_id
   and s.active = true
  where r.product_id is null
     or r.supplier_id is null
     or r.quantity is null
     or r.quantity <= 0
     or r.quantity > 1000000
     or p.id is null
     or p.archived_at is not null
     or sp.id is null
     or s.id is null;

  if v_invalid_count > 0 then
    raise exception 'Há itens inválidos, sem fornecedor ativo vinculado ou com quantidade incorreta';
  end if;

  with requested as (
    select distinct x.product_id
    from jsonb_to_recordset(_items) as x(product_id uuid, supplier_id uuid, quantity numeric)
  )
  select count(*) into v_invalid_count
  from requested r
  where exists (
    select 1
    from public.purchase_order_items poi
    join public.purchase_orders po on po.id = poi.purchase_order_id
    where po.tenant_id = v_tenant_id
      and po.store_id = v_store_id
      and poi.product_id = r.product_id
      and po.status in ('draft','approved','sent','partially_received')
      and poi.quantity_received < poi.quantity_ordered
  );

  if v_invalid_count > 0 then
    raise exception 'Um ou mais produtos selecionados já possuem pedido de compra em aberto';
  end if;

  for v_supplier_id in
    select distinct x.supplier_id
    from jsonb_to_recordset(_items) as x(product_id uuid, supplier_id uuid, quantity numeric)
    order by x.supplier_id
  loop
    insert into public.purchase_orders (
      tenant_id,
      store_id,
      supplier_id,
      status,
      buyer_id,
      external_reference,
      notes
    )
    values (
      v_tenant_id,
      v_store_id,
      v_supplier_id,
      'draft',
      auth.uid(),
      'smart_replenishment',
      'Gerado pela Compra Inteligente. Requer aprovação humana antes do envio ao fornecedor.'
    )
    returning id, number into v_order_id, v_order_number;

    insert into public.purchase_order_items (
      purchase_order_id,
      product_id,
      quantity_ordered,
      unit_cost,
      line_total,
      notes
    )
    select
      v_order_id,
      x.product_id,
      x.quantity,
      coalesce(sp.last_cost, 0),
      round(x.quantity * coalesce(sp.last_cost, 0), 2),
      'Origem: reposição inteligente'
    from jsonb_to_recordset(_items) as x(product_id uuid, supplier_id uuid, quantity numeric)
    join public.supplier_products sp
      on sp.tenant_id = v_tenant_id
     and sp.product_id = x.product_id
     and sp.supplier_id = x.supplier_id
    where x.supplier_id = v_supplier_id;

    get diagnostics v_item_count = row_count;
    perform private.recalculate_purchase_order(v_order_id);

    v_orders := v_orders || jsonb_build_array(
      jsonb_build_object(
        'id', v_order_id,
        'number', v_order_number,
        'supplier_id', v_supplier_id,
        'items', v_item_count
      )
    );
    v_order_count := v_order_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'order_count', v_order_count,
    'orders', v_orders,
    'status', 'draft'
  );
end;
$function$;

revoke all on function public.create_smart_purchase_drafts(jsonb) from public;
revoke all on function public.create_smart_purchase_drafts(jsonb) from anon;
grant execute on function public.create_smart_purchase_drafts(jsonb) to authenticated;
