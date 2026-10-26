alter table public.goods_receipts
  add column if not exists discrepancy_count integer not null default 0,
  add column if not exists discrepancy_summary jsonb not null default '[]'::jsonb,
  add column if not exists checked_with_divergences boolean not null default false;

create or replace function public.start_goods_receipt_from_order(_order_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_order public.purchase_orders%rowtype;
  v_receipt_id uuid;
  v_existing_id uuid;
  v_items integer := 0;
begin
  select * into v_order
  from public.purchase_orders
  where id = _order_id
  for update;

  if not found then
    raise exception 'Pedido de compra não encontrado';
  end if;

  if not private.has_tenant_role(v_order.tenant_id, auth.uid(), array['owner','admin','manager','inventory']) then
    raise exception 'Sem permissão para iniciar este recebimento';
  end if;

  if v_order.status not in ('approved','sent','partially_received') then
    raise exception 'O pedido precisa estar aprovado ou em recebimento parcial';
  end if;

  select gr.id into v_existing_id
  from public.goods_receipts gr
  where gr.purchase_order_id = v_order.id
    and gr.status in ('draft','checked')
  order by gr.created_at desc
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object('ok',true,'receipt_id',v_existing_id,'existing',true);
  end if;

  insert into public.goods_receipts (
    tenant_id, store_id, supplier_id, purchase_order_id,
    status, received_by, notes
  )
  values (
    v_order.tenant_id, v_order.store_id, v_order.supplier_id, v_order.id,
    'draft', auth.uid(), 'Recebimento iniciado a partir do pedido de compra #' || v_order.number::text
  )
  returning id into v_receipt_id;

  insert into public.goods_receipt_items (
    goods_receipt_id,
    purchase_order_item_id,
    product_id,
    quantity,
    unit_cost
  )
  select
    v_receipt_id,
    poi.id,
    poi.product_id,
    (poi.quantity_ordered - poi.quantity_received),
    poi.unit_cost
  from public.purchase_order_items poi
  where poi.purchase_order_id = v_order.id
    and poi.quantity_ordered > poi.quantity_received
  order by poi.created_at, poi.id;

  get diagnostics v_items = row_count;

  if v_items = 0 then
    raise exception 'Este pedido não possui itens pendentes de recebimento';
  end if;

  update public.goods_receipts gr
  set total_cost = (
    select coalesce(sum(gri.quantity * gri.unit_cost),0)
    from public.goods_receipt_items gri
    where gri.goods_receipt_id = gr.id
  ),
  updated_at = now()
  where gr.id = v_receipt_id;

  return jsonb_build_object(
    'ok', true,
    'receipt_id', v_receipt_id,
    'existing', false,
    'items', v_items
  );
end;
$function$;

create or replace function public.check_goods_receipt(
  _receipt_id uuid,
  _accept_divergences boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_receipt public.goods_receipts%rowtype;
  v_item_count integer := 0;
  v_warning_count integer := 0;
  v_blocking_count integer := 0;
  v_summary jsonb := '[]'::jsonb;
begin
  select * into v_receipt
  from public.goods_receipts
  where id = _receipt_id
  for update;

  if not found then
    raise exception 'Recebimento não encontrado';
  end if;

  if not private.has_tenant_role(v_receipt.tenant_id, auth.uid(), array['owner','admin','manager','inventory']) then
    raise exception 'Sem permissão para conferir este recebimento';
  end if;

  if v_receipt.status = 'posted' then
    return jsonb_build_object('ok',true,'receipt_id',v_receipt.id,'already_posted',true);
  end if;

  if v_receipt.status = 'cancelled' then
    raise exception 'Recebimento cancelado';
  end if;

  select count(*) into v_item_count
  from public.goods_receipt_items
  where goods_receipt_id = v_receipt.id;

  if v_item_count = 0 then
    raise exception 'Recebimento sem itens';
  end if;

  with item_checks as (
    select
      gri.id as receipt_item_id,
      gri.product_id,
      p.name as product_name,
      gri.quantity as received_qty,
      coalesce(poi.quantity_ordered - poi.quantity_received, gri.quantity) as expected_qty,
      gri.unit_cost as received_cost,
      coalesce(poi.unit_cost, gri.unit_cost) as expected_cost,
      gri.batch_number,
      gri.expiry_date,
      case
        when gri.expiry_date is not null and gri.expiry_date <= current_date then true
        else false
      end as expired,
      case
        when poi.id is not null and abs(gri.quantity - (poi.quantity_ordered - poi.quantity_received)) > 0.001 then true
        else false
      end as qty_divergence,
      case
        when poi.id is not null and abs(gri.unit_cost - poi.unit_cost) > 0.0001 then true
        else false
      end as cost_divergence,
      case
        when (coalesce(p.requires_prescription,false) or coalesce(p.controlled,false))
          and (nullif(trim(coalesce(gri.batch_number,'')),'') is null or gri.expiry_date is null)
        then true else false
      end as traceability_missing,
      case
        when v_receipt.purchase_order_id is not null and poi.id is null then true
        else false
      end as unlinked_item
    from public.goods_receipt_items gri
    join public.products p on p.id = gri.product_id
    left join public.purchase_order_items poi on poi.id = gri.purchase_order_item_id
    where gri.goods_receipt_id = v_receipt.id
  ), issues as (
    select jsonb_build_object(
      'receipt_item_id', receipt_item_id,
      'product_id', product_id,
      'product_name', product_name,
      'blocking', expired,
      'quantity_divergence', qty_divergence,
      'expected_quantity', expected_qty,
      'received_quantity', received_qty,
      'cost_divergence', cost_divergence,
      'expected_cost', expected_cost,
      'received_cost', received_cost,
      'traceability_missing', traceability_missing,
      'unlinked_item', unlinked_item,
      'expired', expired
    ) as issue,
    expired as blocking,
    (qty_divergence or cost_divergence or traceability_missing or unlinked_item or expired) as has_issue
    from item_checks
  )
  select
    coalesce(jsonb_agg(issue) filter (where has_issue), '[]'::jsonb),
    count(*) filter (where has_issue and not blocking),
    count(*) filter (where blocking)
  into v_summary, v_warning_count, v_blocking_count
  from issues;

  if nullif(trim(coalesce(v_receipt.supplier_invoice_number,'')),'') is null then
    v_summary := v_summary || jsonb_build_array(jsonb_build_object(
      'type','missing_invoice_number',
      'blocking',false,
      'message','Número da nota fiscal não informado'
    ));
    v_warning_count := v_warning_count + 1;
  end if;

  update public.goods_receipts
  set discrepancy_count = v_warning_count + v_blocking_count,
      discrepancy_summary = v_summary,
      updated_at = now()
  where id = v_receipt.id;

  if v_blocking_count > 0 then
    return jsonb_build_object(
      'ok', false,
      'receipt_id', v_receipt.id,
      'blocking', true,
      'blocking_count', v_blocking_count,
      'warning_count', v_warning_count,
      'discrepancies', v_summary
    );
  end if;

  if v_warning_count > 0 and not coalesce(_accept_divergences,false) then
    return jsonb_build_object(
      'ok', false,
      'receipt_id', v_receipt.id,
      'requires_confirmation', true,
      'blocking_count', 0,
      'warning_count', v_warning_count,
      'discrepancies', v_summary
    );
  end if;

  update public.goods_receipts
  set status = 'checked',
      checked_by = auth.uid(),
      checked_at = now(),
      checked_with_divergences = (v_warning_count > 0),
      discrepancy_count = v_warning_count,
      discrepancy_summary = v_summary,
      total_cost = (
        select coalesce(sum(quantity * unit_cost),0)
        from public.goods_receipt_items
        where goods_receipt_id = v_receipt.id
      ),
      updated_at = now()
  where id = v_receipt.id;

  return jsonb_build_object(
    'ok', true,
    'receipt_id', v_receipt.id,
    'status', 'checked',
    'warning_count', v_warning_count,
    'checked_with_divergences', (v_warning_count > 0),
    'discrepancies', v_summary
  );
end;
$function$;

create or replace function public.post_goods_receipt(_receipt_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $$
declare r public.goods_receipts%rowtype;
begin
 select * into r from public.goods_receipts where id=_receipt_id for update;
 if not found then raise exception 'Recebimento não encontrado'; end if;
 if not private.has_tenant_role(r.tenant_id, auth.uid(), array['owner','admin','manager','inventory']) then raise exception 'Sem permissão para lançar este recebimento'; end if;
 if r.status = 'posted' then return jsonb_build_object('ok',true,'already_posted',true,'receipt_id',r.id); end if;
 if r.status <> 'checked' then raise exception 'O recebimento precisa ser conferido antes de lançar no estoque'; end if;
 return public.post_goods_receipt_internal(_receipt_id, auth.uid());
end; $$;

revoke all on function public.start_goods_receipt_from_order(uuid) from public;
revoke all on function public.start_goods_receipt_from_order(uuid) from anon;
grant execute on function public.start_goods_receipt_from_order(uuid) to authenticated;

revoke all on function public.check_goods_receipt(uuid,boolean) from public;
revoke all on function public.check_goods_receipt(uuid,boolean) from anon;
grant execute on function public.check_goods_receipt(uuid,boolean) to authenticated;

revoke all on function public.post_goods_receipt(uuid) from public;
revoke all on function public.post_goods_receipt(uuid) from anon;
grant execute on function public.post_goods_receipt(uuid) to authenticated;

create index if not exists goods_receipts_purchase_order_open_idx
  on public.goods_receipts(purchase_order_id,status,created_at desc)
  where purchase_order_id is not null and status in ('draft','checked');
