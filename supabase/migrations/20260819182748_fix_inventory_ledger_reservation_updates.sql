-- Fix reservation-only inventory ledger movements.
-- UPDATE an existing balance first so reserved_delta can be applied without
-- violating reserved <= on_hand on the candidate INSERT row.

create or replace function private.apply_inventory_ledger_balance()
returns trigger
language plpgsql security definer
set search_path=''
as $$
declare
  v_on_hand numeric;
  v_reserved numeric;
begin
  update public.inventory_balances
  set on_hand=on_hand+new.on_hand_delta,
      reserved=reserved+new.reserved_delta,
      source='internal',
      updated_at=now()
  where tenant_id=new.tenant_id
    and store_id=new.store_id
    and product_id=new.product_id
  returning on_hand,reserved into v_on_hand,v_reserved;

  if not found then
    if new.on_hand_delta < 0 then
      raise exception 'Movimento exige saldo existente para produto %',new.product_id;
    end if;
    if new.reserved_delta < 0 or new.reserved_delta > new.on_hand_delta then
      raise exception 'Reserva exige saldo existente para produto %',new.product_id;
    end if;

    insert into public.inventory_balances(
      tenant_id,store_id,product_id,on_hand,reserved,source,updated_at
    ) values(
      new.tenant_id,new.store_id,new.product_id,
      new.on_hand_delta,new.reserved_delta,'internal',now()
    )
    returning on_hand,reserved into v_on_hand,v_reserved;
  end if;

  if v_on_hand < 0 then
    raise exception 'Estoque negativo não permitido para produto %',new.product_id;
  end if;
  if v_reserved < 0 or v_reserved > v_on_hand then
    raise exception 'Reserva inválida para produto %',new.product_id;
  end if;

  return new;
end;
$$;

revoke all on function private.apply_inventory_ledger_balance()
  from public,anon,authenticated;
