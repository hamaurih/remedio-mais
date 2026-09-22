create or replace function public.approve_purchase_order(_order_id uuid)
returns jsonb language plpgsql security invoker set search_path to ''
as $$
declare o public.purchase_orders%rowtype;
begin
 select * into o from public.purchase_orders where id=_order_id for update;
 if not found then raise exception 'Pedido de compra não encontrado'; end if;
 if not private.has_tenant_role(o.tenant_id, auth.uid(), array['owner','admin','manager']) then raise exception 'Sem permissão para aprovar este pedido'; end if;
 if o.status not in ('draft','pending') then raise exception 'Pedido não está pendente de aprovação'; end if;
 update public.purchase_orders set status='approved', approved_by=auth.uid(), approved_at=now(), updated_at=now() where id=o.id;
 return jsonb_build_object('ok',true,'order_id',o.id,'status','approved');
end; $$;

create or replace function public.post_goods_receipt(_receipt_id uuid)
returns jsonb language plpgsql security invoker set search_path to ''
as $$
declare r public.goods_receipts%rowtype;
begin
 select * into r from public.goods_receipts where id=_receipt_id;
 if not found then raise exception 'Recebimento não encontrado'; end if;
 if not private.has_tenant_role(r.tenant_id, auth.uid(), array['owner','admin','manager','inventory']) then raise exception 'Sem permissão para lançar este recebimento'; end if;
 return public.post_goods_receipt_internal(_receipt_id, auth.uid());
end; $$;

grant execute on function public.approve_purchase_order(uuid) to authenticated;
grant execute on function public.post_goods_receipt(uuid) to authenticated;
create index if not exists purchase_orders_tenant_status_idx on public.purchase_orders(tenant_id,status,created_at desc);
create index if not exists goods_receipts_tenant_status_idx on public.goods_receipts(tenant_id,status,received_at desc);
alter table public.purchase_order_items drop constraint if exists purchase_order_items_positive_qty;
alter table public.purchase_order_items add constraint purchase_order_items_positive_qty check (quantity_ordered > 0);
alter table public.goods_receipt_items drop constraint if exists goods_receipt_items_positive_qty;
alter table public.goods_receipt_items add constraint goods_receipt_items_positive_qty check (quantity > 0);
