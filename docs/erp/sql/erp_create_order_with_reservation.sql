-- CANDIDATO DE HOMOLOGAÇÃO.
-- Compatibilidade mínima da branch de homologação com o contrato atual.
-- Estas alterações são idempotentes e destinam-se exclusivamente ao staging.
alter table public.orders add column if not exists source text not null default 'site';
alter table public.orders add column if not exists created_by text;
alter table public.orders add column if not exists external_idempotency_key text;
alter table public.orders add column if not exists trier_eligible boolean not null default true;
alter table public.orders add column if not exists order_code text;

create unique index if not exists orders_external_idempotency_unique
  on public.orders(external_idempotency_key)
  where external_idempotency_key is not null;

create unique index if not exists orders_order_code_unique
  on public.orders(order_code)
  where order_code is not null;

-- NÃO executar em produção sem passar pela branch Supabase de homologação.
--
-- Objetivo: criar pedido + itens + reservas de estoque em uma única transação.
-- Segurança: SECURITY INVOKER; execução somente service_role.

create or replace function public.erp_create_order_with_reservation(_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_idempotency text := nullif(trim(_payload->>'idempotency_key'), '');
  v_channel text := lower(trim(coalesce(_payload->>'channel','')));
  v_db_channel text;
  v_source text;
  v_tenant_id uuid := nullif(_payload->>'tenant_id','')::uuid;
  v_store_id uuid := nullif(_payload->>'store_id','')::uuid;
  v_customer_name text := nullif(trim(_payload#>>'{customer,name}'),'');
  v_customer_phone text := nullif(trim(_payload#>>'{customer,phone}'),'');
  v_customer_email text := nullif(trim(_payload#>>'{customer,email}'),'');
  v_customer_cpf text := nullif(trim(_payload#>>'{customer,cpf}'),'');
  v_delivery_fee numeric := greatest(coalesce((_payload->>'delivery_fee')::numeric,0),0);
  v_discount numeric := greatest(coalesce((_payload->>'discount')::numeric,0),0);
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_order_id uuid := gen_random_uuid();
  v_order_code text := 'ERP-' || to_char(clock_timestamp(),'YYMMDD') || '-' || upper(substr(replace(v_order_id::text,'-',''),1,6));
  v_existing uuid;
  v_expires_at timestamptz := now() + interval '15 minutes';
  it jsonb;
  p record;
  b record;
  v_qty numeric;
  v_unit numeric;
  v_line numeric;
  v_item_key text;
begin
  if v_idempotency is null then
    raise exception 'idempotency_key_required';
  end if;

  select id into v_existing
  from public.orders
  where external_idempotency_key = v_idempotency
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'order_id', v_existing
    );
  end if;

  if v_channel = 'site' then
    v_db_channel := 'site'; v_source := 'erp_staging_site';
  elsif v_channel = 'pdv' then
    v_db_channel := 'pdv'; v_source := 'erp_staging_pdv';
  elsif v_channel in ('whatsapp_ia','whatsapp_humano') then
    v_db_channel := 'whatsapp'; v_source := case when v_channel='whatsapp_ia' then 'ia' else 'whatsapp_humano' end;
  elsif v_channel = 'telefone' then
    v_db_channel := 'telefone'; v_source := 'erp_staging_telefone';
  else
    raise exception 'invalid_channel';
  end if;

  if v_tenant_id is null or v_store_id is null then
    raise exception 'tenant_store_required';
  end if;

  if not exists (
    select 1 from public.stores s
    where s.id=v_store_id
      and s.tenant_id=v_tenant_id
      and s.active=true
  ) then
    raise exception 'invalid_store';
  end if;

  if v_customer_name is null or v_customer_phone is null then
    raise exception 'customer_required';
  end if;

  if jsonb_array_length(coalesce(_payload->'items','[]'::jsonb)) = 0 then
    raise exception 'items_required';
  end if;

  -- 1) Primeiro bloqueia todos os saldos por product_id em ordem estável.
  for p in
    select ib.product_id
    from public.inventory_balances ib
    where ib.tenant_id=v_tenant_id
      and ib.store_id=v_store_id
      and ib.product_id in (
        select distinct (x->>'product_id')::uuid
        from jsonb_array_elements(_payload->'items') x
      )
    order by ib.product_id
    for update
  loop
    null;
  end loop;

  -- 2) Valida todos os itens antes de criar qualquer pedido.
  for it in select * from jsonb_array_elements(_payload->'items') loop
    v_qty := (it->>'quantity')::numeric;
    v_unit := (it->>'unit_price')::numeric;

    if v_qty <= 0 or trunc(v_qty) <> v_qty then
      raise exception 'invalid_quantity';
    end if;
    if v_unit <= 0 then
      raise exception 'invalid_unit_price';
    end if;

    select pr.id, pr.name, pr.trier_product_id, pr.image_url,
           pr.requires_prescription, pr.controlled
      into p
      from public.products pr
     where pr.id=(it->>'product_id')::uuid;

    if p.id is null then
      raise exception 'product_not_found:%', it->>'product_id';
    end if;

    select * into b
    from public.inventory_balances ib
    where ib.tenant_id=v_tenant_id
      and ib.store_id=v_store_id
      and ib.product_id=p.id
    for update;

    if b.product_id is null then
      raise exception 'inventory_balance_missing:%',p.id;
    end if;
    if coalesce(b.available, b.on_hand-b.reserved, 0) < v_qty then
      raise exception 'insufficient_stock:%',p.id;
    end if;

    v_subtotal := v_subtotal + round(v_unit*v_qty,2);
  end loop;

  v_total := greatest(round(v_subtotal-v_discount+v_delivery_fee,2),0);

  -- Staging: cria pedido pendente, sem Cielo e sem Trier.
  insert into public.orders(
    id,order_code,
    customer_name,customer_phone,customer_email,customer_cpf,
    tenant_id,store_id,
    subtotal,discount,delivery_fee,total,
    payment_status,order_status,status,
    payment_gateway,payment_method,
    sales_channel,source,created_by,
    external_idempotency_key,
    trier_eligible,trier_status
  )
  values(
    v_order_id,v_order_code,
    v_customer_name,v_customer_phone,v_customer_email,v_customer_cpf,
    v_tenant_id,v_store_id,
    v_subtotal,v_discount,v_delivery_fee,v_total,
    'pending','aguardando_pagamento','novo',
    null,null,
    v_db_channel,v_source,nullif(_payload->>'created_by',''),
    v_idempotency,
    false,'not_required'
  )
  returning id into v_order_id;

  -- 3) Cria itens + reserva + ledger.
  for it in select * from jsonb_array_elements(_payload->'items') loop
    v_qty := (it->>'quantity')::numeric;
    v_unit := (it->>'unit_price')::numeric;
    v_line := round(v_unit*v_qty,2);

    select pr.id, pr.name, pr.trier_product_id, pr.image_url,
           pr.requires_prescription, pr.controlled
      into p
      from public.products pr
     where pr.id=(it->>'product_id')::uuid;

    insert into public.order_items(
      order_id,product_id,product_name,unit_price,quantity,total,
      product_image_url,trier_product_id,requires_prescription,controlled
    )
    values(
      v_order_id,p.id,p.name,v_unit,v_qty::int,v_line,
      p.image_url,p.trier_product_id,p.requires_prescription,p.controlled
    );

    v_item_key := 'erp-reserve:'||v_order_id::text||':'||p.id::text;

    insert into public.order_inventory_reservations(
      tenant_id,store_id,order_id,product_id,quantity,status,
      expires_at,idempotency_key
    )
    values(
      v_tenant_id,v_store_id,v_order_id,p.id,v_qty,'active',
      v_expires_at,v_item_key
    );

    insert into public.inventory_ledger(
      tenant_id,store_id,product_id,movement_type,
      on_hand_delta,reserved_delta,
      source_type,source_id,reference,idempotency_key,metadata
    )
    values(
      v_tenant_id,v_store_id,p.id,'reservation',
      0,v_qty,
      'order',v_order_id::text,'Reserva ERP homologação',
      v_item_key,
      jsonb_build_object('environment','staging','channel',v_channel)
    );
  end loop;

  return jsonb_build_object(
    'ok',true,
    'duplicate',false,
    'order_id',v_order_id,
    'subtotal',v_subtotal,
    'discount',v_discount,
    'delivery_fee',v_delivery_fee,
    'total',v_total,
    'reservation_expires_at',v_expires_at
  );
end;
$$;

revoke all on function public.erp_create_order_with_reservation(jsonb) from public;
revoke all on function public.erp_create_order_with_reservation(jsonb) from anon;
revoke all on function public.erp_create_order_with_reservation(jsonb) from authenticated;
grant execute on function public.erp_create_order_with_reservation(jsonb) to service_role;
