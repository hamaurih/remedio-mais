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


-- Segunda trava: mesmo com Edge Function mal configurada, o banco nasce bloqueado.
create table if not exists public.erp_runtime_flags (
  flag_key text primary key,
  enabled boolean not null default false,
  environment text not null default 'production',
  allowed_channels text[] not null default '{}'::text[],
  canary_percent numeric(5,2) not null default 0
    check (canary_percent >= 0 and canary_percent <= 100),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.erp_runtime_flags enable row level security;
revoke all on table public.erp_runtime_flags from public, anon, authenticated;
grant select, update on table public.erp_runtime_flags to service_role;

insert into public.erp_runtime_flags(
  flag_key,enabled,environment,allowed_channels,canary_percent,metadata
)
values(
  'order_command_write',false,'production','{}'::text[],0,
  jsonb_build_object('created_by','migration','safety','default_off')
)
on conflict (flag_key) do nothing;

-- Estoque transacional por variante. Não altera product_variants.stock diretamente
-- durante a reserva; somente commit movimenta o saldo da variante.
alter table public.order_inventory_reservations
  add column if not exists variant_id uuid null references public.product_variants(id) on delete restrict;

drop index if exists public.order_inventory_reservation_active_uq;
create unique index if not exists order_inventory_reservation_active_variant_uq
  on public.order_inventory_reservations(
    order_id,
    product_id,
    coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status='active';

create table if not exists public.variant_inventory_balances (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  on_hand numeric(14,3) not null default 0 check(on_hand >= 0),
  reserved numeric(14,3) not null default 0 check(reserved >= 0 and reserved <= on_hand),
  available numeric(14,3) generated always as (on_hand-reserved) stored,
  source text not null default 'migration' check(source in ('internal','external','manual','migration')),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,store_id,variant_id)
);

create table if not exists public.variant_inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  movement_type text not null,
  on_hand_delta numeric(14,3) not null default 0,
  reserved_delta numeric(14,3) not null default 0,
  source_type text,
  source_id text,
  reference text,
  reason text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists variant_inventory_ledger_idempotency_uq
  on public.variant_inventory_ledger(idempotency_key)
  where idempotency_key is not null;
create index if not exists variant_inventory_ledger_store_variant_created_idx
  on public.variant_inventory_ledger(store_id,variant_id,created_at desc);

alter table public.variant_inventory_balances enable row level security;
alter table public.variant_inventory_ledger enable row level security;
revoke all on table public.variant_inventory_balances from public,anon,authenticated;
revoke all on table public.variant_inventory_ledger from public,anon,authenticated;
grant select,insert,update,delete on table public.variant_inventory_balances to service_role;
grant select,insert,update,delete on table public.variant_inventory_ledger to service_role;

create or replace function private.apply_variant_inventory_ledger_balance()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_on_hand numeric;
  v_reserved numeric;
begin
  update public.variant_inventory_balances
     set on_hand=on_hand+new.on_hand_delta,
         reserved=reserved+new.reserved_delta,
         source='internal',
         updated_at=now()
   where tenant_id=new.tenant_id
     and store_id=new.store_id
     and variant_id=new.variant_id
  returning on_hand,reserved into v_on_hand,v_reserved;

  if not found then
    if new.on_hand_delta < 0 or new.reserved_delta <> 0 then
      raise exception 'variant_inventory_balance_missing:%',new.variant_id;
    end if;
    insert into public.variant_inventory_balances(
      tenant_id,store_id,variant_id,on_hand,reserved,source,updated_at
    )
    values(
      new.tenant_id,new.store_id,new.variant_id,new.on_hand_delta,0,'internal',now()
    )
    returning on_hand,reserved into v_on_hand,v_reserved;
  end if;

  if v_on_hand < 0 then
    raise exception 'variant_negative_stock:%',new.variant_id;
  end if;
  if v_reserved < 0 or v_reserved > v_on_hand then
    raise exception 'variant_invalid_reservation:%',new.variant_id;
  end if;
  return new;
end;
$$;
revoke all on function private.apply_variant_inventory_ledger_balance() from public,anon,authenticated;

drop trigger if exists trg_variant_inventory_ledger_apply_balance on public.variant_inventory_ledger;
create trigger trg_variant_inventory_ledger_apply_balance
after insert on public.variant_inventory_ledger
for each row execute function private.apply_variant_inventory_ledger_balance();

-- Migração transitória segura: só replica product_variants.stock quando o tenant
-- possui exatamente uma loja ativa de fulfillment. Em ambientes multi-loja,
-- nenhuma distribuição é inventada.
with single_store as (
  select tenant_id,min(id) as store_id
  from public.stores
  where active=true and ecommerce_fulfillment_enabled=true
  group by tenant_id
  having count(*)=1
)
insert into public.variant_inventory_balances(
  tenant_id,store_id,variant_id,on_hand,reserved,source
)
select ss.tenant_id,ss.store_id,v.id,greatest(coalesce(v.stock,0),0),0,'migration'
from single_store ss
cross join public.product_variants v
on conflict(tenant_id,store_id,variant_id) do nothing;

-- NÃO executar em produção sem passar pela branch Supabase de homologação.
--
-- Objetivo: criar pedido + itens + reservas de estoque em uma única transação.
-- Segurança: SECURITY INVOKER; execução somente service_role.
-- Preço: o payload recebido aqui já deve ter sido precificado no servidor pela Edge Function.

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
  v_user_id uuid := nullif(_payload->>'user_id','')::uuid;
  v_customer_name text := nullif(trim(_payload#>>'{customer,name}'),'');
  v_customer_phone text := nullif(trim(_payload#>>'{customer,phone}'),'');
  v_customer_email text := nullif(trim(_payload#>>'{customer,email}'),'');
  v_customer_cpf text := nullif(trim(_payload#>>'{customer,cpf}'),'');
  v_delivery_type text := lower(trim(coalesce(_payload->>'delivery_type','pickup')));
  v_delivery_cep text := nullif(trim(_payload#>>'{delivery,cep}'),'');
  v_delivery_street text := nullif(trim(_payload#>>'{delivery,street}'),'');
  v_delivery_number text := nullif(trim(_payload#>>'{delivery,number}'),'');
  v_delivery_complement text := nullif(trim(_payload#>>'{delivery,complement}'),'');
  v_delivery_neighborhood text := nullif(trim(_payload#>>'{delivery,neighborhood}'),'');
  v_delivery_city text := nullif(trim(_payload#>>'{delivery,city}'),'');
  v_delivery_state text := upper(nullif(trim(_payload#>>'{delivery,state}'),''));
  v_delivery_reference text := nullif(trim(_payload#>>'{delivery,reference}'),'');
  v_delivery_lat numeric := nullif(_payload#>>'{delivery,lat}','')::numeric;
  v_delivery_lng numeric := nullif(_payload#>>'{delivery,lng}','')::numeric;
  v_payment_method text := nullif(lower(trim(_payload->>'payment_method')),'');
  v_payment_gateway text;
  v_meta_fbp text := nullif(trim(_payload#>>'{meta,fbp}'),'');
  v_meta_fbc text := nullif(trim(_payload#>>'{meta,fbc}'),'');
  v_delivery_fee numeric := greatest(coalesce((_payload->>'delivery_fee')::numeric,0),0);
  v_discount numeric := greatest(coalesce((_payload->>'discount')::numeric,0),0);
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_order_id uuid := gen_random_uuid();
  v_order_code text := 'ERP-' || to_char(clock_timestamp(),'YYMMDD') || '-' || upper(substr(replace(v_order_id::text,'-',''),1,6));
  v_existing uuid;
  v_db_enabled boolean := false;
  v_db_environment text := 'production';
  v_db_channels text[] := '{}'::text[];
  v_trier_eligible boolean := false;
  v_reservation_minutes integer := 30;
  v_expires_at timestamptz;
  v_prescription_original_required boolean := false;
  it jsonb;
  p record;
  v_variant record;
  b record;
  vb record;
  v_qty numeric;
  v_unit numeric;
  v_line numeric;
  v_item_key text;
  v_variant_id uuid;
  v_prescription_id uuid;
  v_variant_label text;
begin
  if v_idempotency is null then
    raise exception 'idempotency_key_required';
  end if;

  select id into v_existing
  from public.orders
  where external_idempotency_key=v_idempotency
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok',true,'duplicate',true,'order_id',v_existing);
  end if;

  select f.enabled,f.environment,f.allowed_channels
    into v_db_enabled,v_db_environment,v_db_channels
  from public.erp_runtime_flags f
  where f.flag_key='order_command_write';

  if coalesce(v_db_enabled,false) is not true then
    raise exception 'erp_order_command_db_disabled';
  end if;
  if cardinality(coalesce(v_db_channels,'{}'::text[]))=0
     or not (v_channel=any(v_db_channels)) then
    raise exception 'erp_order_channel_db_disabled:%',v_channel;
  end if;

  if v_channel='site' then
    v_db_channel:='site';
    v_source:=case when v_db_environment='production' then 'erp_site_canary' else 'erp_staging_site' end;
    v_trier_eligible:=(v_db_environment='production');
  elsif v_channel='pdv' then
    v_db_channel:='pdv'; v_source:='erp_staging_pdv';
  elsif v_channel in ('whatsapp_ia','whatsapp_humano') then
    v_db_channel:='whatsapp'; v_source:=case when v_channel='whatsapp_ia' then 'ia' else 'whatsapp_humano' end;
  elsif v_channel='telefone' then
    v_db_channel:='telefone'; v_source:='erp_staging_telefone';
  else
    raise exception 'invalid_channel';
  end if;

  if v_tenant_id is null or v_store_id is null then
    raise exception 'tenant_store_required';
  end if;
  if not exists(
    select 1 from public.stores s
    where s.id=v_store_id and s.tenant_id=v_tenant_id and s.active=true
  ) then
    raise exception 'invalid_store';
  end if;

  if v_customer_name is null or v_customer_phone is null then
    raise exception 'customer_required';
  end if;

  if v_delivery_type not in ('pickup','delivery') then
    raise exception 'invalid_delivery_type';
  end if;
  if v_delivery_type='delivery'
     and (v_delivery_cep is null or v_delivery_street is null or v_delivery_number is null
       or v_delivery_neighborhood is null or v_delivery_city is null or v_delivery_state is null) then
    raise exception 'delivery_address_required';
  end if;

  if v_payment_method is not null and v_payment_method not in ('pix','credit_card') then
    raise exception 'invalid_payment_method';
  end if;
  v_payment_gateway:=case when v_channel='site' and v_payment_method is not null then 'cielo' else null end;

  if jsonb_array_length(coalesce(_payload->'items','[]'::jsonb))=0 then
    raise exception 'items_required';
  end if;
  if jsonb_array_length(coalesce(_payload->'items','[]'::jsonb))>100 then
    raise exception 'too_many_items';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(_payload->'items') x
    group by x->>'product_id',coalesce(x->>'variant_id','')
    having count(*)>1
  ) then
    raise exception 'duplicate_item';
  end if;

  select fp.reservation_minutes into v_reservation_minutes
  from public.fulfillment_policies fp
  where fp.tenant_id=v_tenant_id;
  v_reservation_minutes:=greatest(5,least(coalesce(v_reservation_minutes,30),240));
  v_expires_at:=now()+make_interval(mins=>v_reservation_minutes);

  -- Locks estáveis para produtos sem variante.
  for p in
    select ib.product_id
    from public.inventory_balances ib
    where ib.tenant_id=v_tenant_id
      and ib.store_id=v_store_id
      and ib.product_id in (
        select distinct (x->>'product_id')::uuid
        from jsonb_array_elements(_payload->'items') x
        where nullif(x->>'variant_id','') is null
      )
    order by ib.product_id
    for update
  loop null; end loop;

  -- Locks estáveis para variantes.
  for v_variant in
    select vib.variant_id
    from public.variant_inventory_balances vib
    where vib.tenant_id=v_tenant_id
      and vib.store_id=v_store_id
      and vib.variant_id in (
        select distinct (x->>'variant_id')::uuid
        from jsonb_array_elements(_payload->'items') x
        where nullif(x->>'variant_id','') is not null
      )
    order by vib.variant_id
    for update
  loop null; end loop;

  for it in select * from jsonb_array_elements(_payload->'items') loop
    v_qty:=(it->>'quantity')::numeric;
    v_unit:=(it->>'unit_price')::numeric;
    v_variant_id:=nullif(it->>'variant_id','')::uuid;
    v_prescription_id:=nullif(it->>'prescription_id','')::uuid;

    if v_qty<=0 or trunc(v_qty)<>v_qty then raise exception 'invalid_quantity'; end if;
    if v_unit<=0 then raise exception 'invalid_unit_price'; end if;

    select pr.id,pr.name,pr.trier_product_id,pr.image_url,
           pr.requires_prescription,pr.controlled,pr.has_variants
      into p
    from public.products pr
    where pr.id=(it->>'product_id')::uuid;

    if p.id is null then raise exception 'product_not_found:%',it->>'product_id'; end if;

    if v_variant_id is not null then
      select pv.id,pv.parent_product_id,pv.active,pv.variation_type,pv.variation_value
        into v_variant
      from public.product_variants pv
      where pv.id=v_variant_id
      for update;

      if v_variant.id is null or v_variant.parent_product_id<>p.id or v_variant.active is not true then
        raise exception 'invalid_variant:%',v_variant_id;
      end if;

      select * into vb
      from public.variant_inventory_balances vib
      where vib.tenant_id=v_tenant_id
        and vib.store_id=v_store_id
        and vib.variant_id=v_variant_id
      for update;

      if vb.variant_id is null then raise exception 'variant_inventory_balance_missing:%',v_variant_id; end if;
      if coalesce(vb.available,0)<v_qty then raise exception 'insufficient_variant_stock:%',v_variant_id; end if;
    else
      if coalesce(p.has_variants,false) then raise exception 'variant_required:%',p.id; end if;

      select * into b
      from public.inventory_balances ib
      where ib.tenant_id=v_tenant_id
        and ib.store_id=v_store_id
        and ib.product_id=p.id
      for update;

      if b.product_id is null then raise exception 'inventory_balance_missing:%',p.id; end if;
      if coalesce(b.available,b.on_hand-b.reserved,0)<v_qty then raise exception 'insufficient_stock:%',p.id; end if;
    end if;

    if coalesce(p.requires_prescription,false) or coalesce(p.controlled,false) then
      v_prescription_original_required:=true;
      if v_user_id is null or v_prescription_id is null then
        raise exception 'prescription_required:%',p.id;
      end if;
      if not exists(
        select 1 from public.prescriptions rx
        where rx.id=v_prescription_id
          and rx.user_id=v_user_id
          and rx.product_id=p.id
          and rx.status in ('recebida','em_analise','aprovada','approved','finalizada')
      ) then
        raise exception 'invalid_prescription:%',p.id;
      end if;
    end if;

    v_subtotal:=v_subtotal+round(v_unit*v_qty,2);
  end loop;

  v_total:=greatest(round(v_subtotal-v_discount+v_delivery_fee,2),0);

  insert into public.orders(
    id,order_code,user_id,
    customer_name,customer_phone,customer_email,customer_cpf,customer_address,
    tenant_id,store_id,
    delivery_method,delivery_type,delivery_cep,delivery_street,delivery_number,
    delivery_complement,delivery_neighborhood,delivery_city,delivery_state,delivery_reference,
    delivery_lat,delivery_lng,
    subtotal,discount,delivery_fee,total,
    payment_status,order_status,status,payment_gateway,payment_method,
    prescription_original_required,prescription_original_status,
    meta_fbp,meta_fbc,
    sales_channel,source,created_by,external_idempotency_key,
    trier_eligible,trier_status,trier_sent
  )
  values(
    v_order_id,v_order_code,v_user_id,
    v_customer_name,v_customer_phone,v_customer_email,v_customer_cpf,
    case when v_delivery_type='delivery' then concat_ws(', ',v_delivery_street,v_delivery_number,v_delivery_neighborhood,v_delivery_city,v_delivery_state) else null end,
    v_tenant_id,v_store_id,
    v_delivery_type,v_delivery_type,v_delivery_cep,v_delivery_street,v_delivery_number,
    v_delivery_complement,v_delivery_neighborhood,v_delivery_city,v_delivery_state,v_delivery_reference,
    v_delivery_lat,v_delivery_lng,
    v_subtotal,v_discount,v_delivery_fee,v_total,
    'pending','aguardando_pagamento','novo',v_payment_gateway,v_payment_method,
    v_prescription_original_required,
    case when v_prescription_original_required then 'pending_collection' else 'not_required' end,
    left(v_meta_fbp,128),left(v_meta_fbc,256),
    v_db_channel,v_source,nullif(_payload->>'created_by',''),v_idempotency,
    v_trier_eligible,case when v_trier_eligible then 'pending' else 'not_required' end,false
  )
  returning id into v_order_id;

  for it in select * from jsonb_array_elements(_payload->'items') loop
    v_qty:=(it->>'quantity')::numeric;
    v_unit:=(it->>'unit_price')::numeric;
    v_line:=round(v_unit*v_qty,2);
    v_variant_id:=nullif(it->>'variant_id','')::uuid;
    v_prescription_id:=nullif(it->>'prescription_id','')::uuid;
    v_variant_label:=nullif(trim(it->>'variant_label'),'');

    select pr.id,pr.name,pr.trier_product_id,pr.image_url,
           pr.requires_prescription,pr.controlled
      into p
    from public.products pr
    where pr.id=(it->>'product_id')::uuid;

    insert into public.order_items(
      order_id,product_id,variant_id,variant_label,product_name,unit_price,quantity,total,
      product_image_url,trier_product_id,requires_prescription,controlled,
      prescription_id,prescription_condition
    )
    values(
      v_order_id,p.id,v_variant_id,v_variant_label,
      case when v_variant_label is not null then p.name||' — '||v_variant_label else p.name end,
      v_unit,v_qty::int,v_line,
      p.image_url,p.trier_product_id,p.requires_prescription,p.controlled,
      v_prescription_id,
      case when coalesce(p.requires_prescription,false) or coalesce(p.controlled,false)
           then 'original_on_delivery' else 'none' end
    );

    v_item_key:='erp-reserve:'||v_order_id::text||':'||p.id::text||':'||coalesce(v_variant_id::text,'root');

    insert into public.order_inventory_reservations(
      tenant_id,store_id,order_id,product_id,variant_id,quantity,status,expires_at,idempotency_key
    )
    values(
      v_tenant_id,v_store_id,v_order_id,p.id,v_variant_id,v_qty,'active',v_expires_at,v_item_key
    );

    if v_variant_id is null then
      insert into public.inventory_ledger(
        tenant_id,store_id,product_id,movement_type,on_hand_delta,reserved_delta,
        source_type,source_id,reference,idempotency_key,metadata
      )
      values(
        v_tenant_id,v_store_id,p.id,'reservation',0,v_qty,
        'order',v_order_id::text,'Reserva ERP homologação',v_item_key,
        jsonb_build_object('environment','staging','channel',v_channel,'reservation_minutes',v_reservation_minutes)
      );
    else
      insert into public.variant_inventory_ledger(
        tenant_id,store_id,variant_id,movement_type,on_hand_delta,reserved_delta,
        source_type,source_id,reference,idempotency_key,metadata
      )
      values(
        v_tenant_id,v_store_id,v_variant_id,'reservation',0,v_qty,
        'order',v_order_id::text,'Reserva ERP variante homologação',v_item_key,
        jsonb_build_object('environment','staging','channel',v_channel,'reservation_minutes',v_reservation_minutes)
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'duplicate',false,'order_id',v_order_id,
    'subtotal',v_subtotal,'discount',v_discount,'delivery_fee',v_delivery_fee,'total',v_total,
    'reservation_minutes',v_reservation_minutes,'reservation_expires_at',v_expires_at,
    'prescription_original_required',v_prescription_original_required
  );
end;
$$;

revoke all on function public.erp_create_order_with_reservation(jsonb) from public;
revoke all on function public.erp_create_order_with_reservation(jsonb) from anon;
revoke all on function public.erp_create_order_with_reservation(jsonb) from authenticated;
grant execute on function public.erp_create_order_with_reservation(jsonb) to service_role;

-- Commit/release compatíveis com produto simples e variante.
create or replace function public.commit_order_inventory_internal(_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.order_inventory_reservations%rowtype;
  v_count integer:=0;
begin
  for r in
    select * from public.order_inventory_reservations
    where order_id=_order_id and status='active'
    order by created_at,id
    for update
  loop
    if r.variant_id is null then
      insert into public.inventory_ledger(
        tenant_id,store_id,product_id,movement_type,on_hand_delta,reserved_delta,
        source_type,source_id,reference,idempotency_key,metadata
      )
      values(
        r.tenant_id,r.store_id,r.product_id,'sale',-r.quantity,-r.quantity,
        'order',_order_id::text,'Venda e-commerce',
        'order-commit:'||_order_id::text||':'||r.product_id::text||':root',
        '{}'::jsonb
      )
      on conflict do nothing;
    else
      insert into public.variant_inventory_ledger(
        tenant_id,store_id,variant_id,movement_type,on_hand_delta,reserved_delta,
        source_type,source_id,reference,idempotency_key,metadata
      )
      values(
        r.tenant_id,r.store_id,r.variant_id,'sale',-r.quantity,-r.quantity,
        'order',_order_id::text,'Venda e-commerce variante',
        'order-commit:'||_order_id::text||':'||r.product_id::text||':'||r.variant_id::text,
        '{}'::jsonb
      )
      on conflict do nothing;

      update public.product_variants pv
         set stock=greatest(0,pv.stock-r.quantity::integer),
             updated_at=now()
       where pv.id=r.variant_id;
    end if;

    update public.order_inventory_reservations
       set status='committed',committed_at=now(),updated_at=now()
     where id=r.id;
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('ok',true,'committed_items',v_count);
end;
$$;
revoke all on function public.commit_order_inventory_internal(uuid) from public,anon,authenticated;
grant execute on function public.commit_order_inventory_internal(uuid) to service_role;

create or replace function public.release_order_inventory_internal(_order_id uuid,_reason text default 'released')
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.order_inventory_reservations%rowtype;
  v_count integer:=0;
begin
  for r in
    select * from public.order_inventory_reservations
    where order_id=_order_id and status='active'
    order by created_at,id
    for update
  loop
    if r.variant_id is null then
      insert into public.inventory_ledger(
        tenant_id,store_id,product_id,movement_type,on_hand_delta,reserved_delta,
        source_type,source_id,reference,idempotency_key,metadata
      )
      values(
        r.tenant_id,r.store_id,r.product_id,'release',0,-r.quantity,
        'order',_order_id::text,'Liberação de reserva',
        'order-release:'||_order_id::text||':'||r.product_id::text||':root',
        jsonb_build_object('reason',_reason)
      )
      on conflict do nothing;
    else
      insert into public.variant_inventory_ledger(
        tenant_id,store_id,variant_id,movement_type,on_hand_delta,reserved_delta,
        source_type,source_id,reference,idempotency_key,metadata
      )
      values(
        r.tenant_id,r.store_id,r.variant_id,'release',0,-r.quantity,
        'order',_order_id::text,'Liberação de reserva variante',
        'order-release:'||_order_id::text||':'||r.product_id::text||':'||r.variant_id::text,
        jsonb_build_object('reason',_reason)
      )
      on conflict do nothing;
    end if;

    update public.order_inventory_reservations
       set status=case when _reason='expired' then 'expired' else 'released' end,
           released_at=now(),release_reason=_reason,updated_at=now()
     where id=r.id;
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('ok',true,'released_items',v_count);
end;
$$;
revoke all on function public.release_order_inventory_internal(uuid,text) from public,anon,authenticated;
grant execute on function public.release_order_inventory_internal(uuid,text) to service_role;

-- Liberação de reservas vencidas.
-- A função apenas orquestra a rotina existente release_order_inventory_internal.
create or replace function public.erp_expire_due_reservations(_limit integer default 100)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
  v_result jsonb;
  v_orders integer := 0;
  v_items integer := 0;
  v_limit integer := greatest(1, least(coalesce(_limit,100),200));
begin
  for r in
    select oir.order_id, min(oir.expires_at) as expires_at
    from public.order_inventory_reservations oir
    where oir.status='active'
      and oir.expires_at <= now()
    group by oir.order_id
    order by min(oir.expires_at), oir.order_id
    limit v_limit
  loop
    select public.release_order_inventory_internal(r.order_id,'expired')
      into v_result;
    v_orders := v_orders + 1;
    v_items := v_items + coalesce((v_result->>'released_items')::integer,0);
  end loop;

  return jsonb_build_object(
    'ok',true,
    'expired_orders',v_orders,
    'released_items',v_items
  );
end;
$$;

revoke all on function public.erp_expire_due_reservations(integer) from public;
revoke all on function public.erp_expire_due_reservations(integer) from anon;
revoke all on function public.erp_expire_due_reservations(integer) from authenticated;
grant execute on function public.erp_expire_due_reservations(integer) to service_role;
