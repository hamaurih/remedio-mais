
create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  primary_order_id uuid null references public.orders(id) on delete set null,
  contact_kind text not null default 'registered'
    check (contact_kind in ('registered','guest','external')),
  full_name text null,
  email text null,
  phone text null,
  cpf text null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_contacts_tenant_user_uq
  on public.crm_contacts(tenant_id,user_id) where user_id is not null;
create unique index if not exists crm_contacts_tenant_guest_order_uq
  on public.crm_contacts(tenant_id,primary_order_id) where primary_order_id is not null;
create index if not exists crm_contacts_last_seen_idx
  on public.crm_contacts(tenant_id,last_seen_at desc);

create table if not exists public.crm_contact_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  identity_type text not null check (identity_type in ('user_id','cpf','phone','email','whatsapp','external')),
  normalized_value text not null,
  verified boolean not null default false,
  source text not null default 'erp',
  created_at timestamptz not null default now(),
  unique(contact_id,identity_type,normalized_value)
);

create index if not exists crm_contact_identities_lookup_idx
  on public.crm_contact_identities(tenant_id,identity_type,normalized_value);

create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid null references public.crm_contacts(id) on delete set null,
  cart_session_id uuid null,
  order_id uuid null references public.orders(id) on delete set null,
  conversation_id text null,
  status text not null default 'open'
    check (status in ('open','won','lost','cancelled')),
  stage text not null default 'new'
    check (stage in ('new','engaged','cart','checkout','payment','conversation','quote','order','processing','won','lost','cancelled')),
  origin_channel text not null default 'unknown',
  current_channel text not null default 'unknown',
  value numeric(14,2) not null default 0,
  first_touch_at timestamptz not null default now(),
  last_touch_at timestamptz not null default now(),
  won_at timestamptz null,
  lost_at timestamptz null,
  loss_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_opportunities_tenant_cart_uq
  on public.crm_opportunities(tenant_id,cart_session_id)
  where cart_session_id is not null;
create unique index if not exists crm_opportunities_tenant_order_uq
  on public.crm_opportunities(tenant_id,order_id)
  where order_id is not null;
create index if not exists crm_opportunities_stage_idx
  on public.crm_opportunities(tenant_id,status,stage,last_touch_at desc);

create table if not exists public.crm_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid null references public.crm_contacts(id) on delete set null,
  opportunity_id uuid null references public.crm_opportunities(id) on delete set null,
  event_type text not null,
  channel text not null default 'unknown',
  source text not null default 'erp',
  occurred_at timestamptz not null default now(),
  order_id uuid null references public.orders(id) on delete set null,
  cart_session_id uuid null,
  conversation_id text null,
  path text null,
  value numeric(14,2) null,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text null,
  created_at timestamptz not null default now()
);

create unique index if not exists crm_events_dedupe_uq
  on public.crm_events(tenant_id,dedupe_key) where dedupe_key is not null;
create index if not exists crm_events_contact_time_idx
  on public.crm_events(tenant_id,contact_id,occurred_at desc);
create index if not exists crm_events_order_idx
  on public.crm_events(order_id,occurred_at desc);
create index if not exists crm_events_cart_idx
  on public.crm_events(cart_session_id,occurred_at desc);
create index if not exists crm_events_channel_idx
  on public.crm_events(tenant_id,channel,occurred_at desc);

create table if not exists public.crm_external_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source text not null,
  external_event_id text not null,
  event_type text not null,
  conversation_id text null,
  contact_hint jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processed','ignored','error')),
  error_message text null,
  unique(tenant_id,source,external_event_id)
);

alter table public.crm_contacts enable row level security;
alter table public.crm_contact_identities enable row level security;
alter table public.crm_opportunities enable row level security;
alter table public.crm_events enable row level security;
alter table public.crm_external_inbox enable row level security;

create policy crm_contacts_admin_read_v1 on public.crm_contacts
for select to authenticated
using (
  app_security.has_role(auth.uid(),'admin'::public.app_role)
  or private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager'])
);

create policy crm_identities_admin_read_v1 on public.crm_contact_identities
for select to authenticated
using (
  app_security.has_role(auth.uid(),'admin'::public.app_role)
  or private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager'])
);

create policy crm_opportunities_admin_read_v1 on public.crm_opportunities
for select to authenticated
using (
  app_security.has_role(auth.uid(),'admin'::public.app_role)
  or private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager'])
);

create policy crm_events_admin_read_v1 on public.crm_events
for select to authenticated
using (
  app_security.has_role(auth.uid(),'admin'::public.app_role)
  or private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager'])
);

create policy crm_external_inbox_admin_read_v1 on public.crm_external_inbox
for select to authenticated
using (
  app_security.has_role(auth.uid(),'admin'::public.app_role)
  or private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager'])
);

grant select on public.crm_contacts, public.crm_contact_identities, public.crm_opportunities, public.crm_events, public.crm_external_inbox to authenticated;

create or replace function private.crm_active_tenant_id()
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select t.id
  from public.tenants t
  where t.active=true
  order by t.created_at asc
  limit 1
$$;

create or replace function private.crm_channel(
  p_sales_channel text,
  p_source text
)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when lower(coalesce(p_source,''))='ia' or lower(coalesce(p_sales_channel,''))='whatsapp' then 'whatsapp'
    when lower(coalesce(p_sales_channel,'')) in ('pdv','balcao') then 'balcao'
    when lower(coalesce(p_sales_channel,''))='vendedor' then 'vendedor'
    when lower(coalesce(p_sales_channel,''))='telefone' then 'telefone'
    when lower(coalesce(p_sales_channel,''))='site' then 'site'
    else coalesce(nullif(lower(p_sales_channel),''),nullif(lower(p_source),''),'unknown')
  end
$$;

create or replace function private.crm_contact_for_user(
  p_tenant_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_contact_id uuid;
  v_profile public.profiles%rowtype;
begin
  if p_tenant_id is null or p_user_id is null then return null; end if;

  select * into v_profile from public.profiles where id=p_user_id;

  insert into public.crm_contacts(
    tenant_id,user_id,contact_kind,full_name,email,phone,cpf,first_seen_at,last_seen_at
  )
  values(
    p_tenant_id,p_user_id,'registered',
    v_profile.full_name,v_profile.email,v_profile.phone,v_profile.cpf,now(),now()
  )
  on conflict(tenant_id,user_id) where user_id is not null
  do update set
    full_name=coalesce(excluded.full_name,public.crm_contacts.full_name),
    email=coalesce(excluded.email,public.crm_contacts.email),
    phone=coalesce(excluded.phone,public.crm_contacts.phone),
    cpf=coalesce(excluded.cpf,public.crm_contacts.cpf),
    last_seen_at=greatest(public.crm_contacts.last_seen_at,excluded.last_seen_at),
    updated_at=now()
  returning id into v_contact_id;

  insert into public.crm_contact_identities(tenant_id,contact_id,identity_type,normalized_value,verified,source)
  values(p_tenant_id,v_contact_id,'user_id',p_user_id::text,true,'auth')
  on conflict do nothing;

  return v_contact_id;
end
$$;

create or replace function private.crm_contact_for_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_tenant_id uuid;
  v_contact_id uuid;
  v_norm text;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return null; end if;

  v_tenant_id:=coalesce(v_order.tenant_id,private.crm_active_tenant_id());
  if v_tenant_id is null then return null; end if;

  if v_order.user_id is not null then
    v_contact_id:=private.crm_contact_for_user(v_tenant_id,v_order.user_id);
    update public.crm_contacts
    set full_name=coalesce(nullif(v_order.customer_name,''),full_name),
        email=coalesce(nullif(v_order.customer_email,''),email),
        phone=coalesce(nullif(v_order.customer_phone,''),phone),
        cpf=coalesce(nullif(v_order.customer_cpf,''),cpf),
        last_seen_at=greatest(last_seen_at,coalesce(v_order.updated_at,v_order.created_at,now())),
        updated_at=now()
    where id=v_contact_id;
  else
    insert into public.crm_contacts(
      tenant_id,primary_order_id,contact_kind,full_name,email,phone,cpf,first_seen_at,last_seen_at
    )
    values(
      v_tenant_id,v_order.id,'guest',
      nullif(v_order.customer_name,''),nullif(v_order.customer_email,''),
      nullif(v_order.customer_phone,''),nullif(v_order.customer_cpf,''),
      coalesce(v_order.created_at,now()),coalesce(v_order.updated_at,v_order.created_at,now())
    )
    on conflict(tenant_id,primary_order_id) where primary_order_id is not null
    do update set
      full_name=coalesce(excluded.full_name,public.crm_contacts.full_name),
      email=coalesce(excluded.email,public.crm_contacts.email),
      phone=coalesce(excluded.phone,public.crm_contacts.phone),
      cpf=coalesce(excluded.cpf,public.crm_contacts.cpf),
      last_seen_at=greatest(public.crm_contacts.last_seen_at,excluded.last_seen_at),
      updated_at=now()
    returning id into v_contact_id;
  end if;

  if nullif(regexp_replace(coalesce(v_order.customer_cpf,''),'\D','','g'),'') is not null then
    v_norm:=regexp_replace(v_order.customer_cpf,'\D','','g');
    insert into public.crm_contact_identities(tenant_id,contact_id,identity_type,normalized_value,verified,source)
    values(v_tenant_id,v_contact_id,'cpf',v_norm,false,'order')
    on conflict do nothing;
  end if;
  if nullif(regexp_replace(coalesce(v_order.customer_phone,''),'\D','','g'),'') is not null then
    v_norm:=regexp_replace(v_order.customer_phone,'\D','','g');
    insert into public.crm_contact_identities(tenant_id,contact_id,identity_type,normalized_value,verified,source)
    values(v_tenant_id,v_contact_id,'phone',v_norm,false,'order')
    on conflict do nothing;
  end if;
  if nullif(lower(trim(coalesce(v_order.customer_email,''))),'') is not null then
    v_norm:=lower(trim(v_order.customer_email));
    insert into public.crm_contact_identities(tenant_id,contact_id,identity_type,normalized_value,verified,source)
    values(v_tenant_id,v_contact_id,'email',v_norm,false,'order')
    on conflict do nothing;
  end if;

  return v_contact_id;
end
$$;

create or replace function private.crm_sync_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_tenant_id uuid;
  v_contact_id uuid;
  v_opp_id uuid;
  v_channel text;
  v_stage text;
  v_status text;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return; end if;

  v_tenant_id:=coalesce(v_order.tenant_id,private.crm_active_tenant_id());
  if v_tenant_id is null then return; end if;
  v_contact_id:=private.crm_contact_for_order(v_order.id);
  v_channel:=private.crm_channel(v_order.sales_channel,v_order.source);

  v_status:=case
    when lower(coalesce(v_order.status,'')) in ('cancelado','cancelled')
      or lower(coalesce(v_order.order_status,'')) in ('cancelado','cancelled') then 'cancelled'
    when lower(coalesce(v_order.payment_status,''))='approved'
      or lower(coalesce(v_order.order_status,'')) in ('pago','entregue','retirado','finalizado','concluido') then 'won'
    else 'open' end;

  v_stage:=case
    when v_status='cancelled' then 'cancelled'
    when v_status='won' then 'won'
    when lower(coalesce(v_order.fulfillment_status,'')) in ('picking','packed','shipped')
      or lower(coalesce(v_order.order_status,'')) in ('em_separacao','separando','saiu_para_entrega','pronto_retirada','pronto_para_retirada') then 'processing'
    else 'order' end;

  select o.id into v_opp_id
  from public.crm_opportunities o
  where o.tenant_id=v_tenant_id
    and (
      o.order_id=v_order.id
      or (v_order.cart_session_id is not null and o.cart_session_id=v_order.cart_session_id)
    )
  order by (o.order_id=v_order.id) desc, o.created_at asc
  limit 1
  for update;

  if v_opp_id is null then
    insert into public.crm_opportunities(
      tenant_id,contact_id,cart_session_id,order_id,conversation_id,status,stage,
      origin_channel,current_channel,value,first_touch_at,last_touch_at,won_at
    )
    values(
      v_tenant_id,v_contact_id,v_order.cart_session_id,v_order.id,
      coalesce(v_order.source_conversation_id,v_order.ai_conversation_id),
      v_status,v_stage,v_channel,v_channel,coalesce(v_order.total,0),
      coalesce(v_order.created_at,now()),coalesce(v_order.updated_at,v_order.created_at,now()),
      case when v_status='won' then coalesce(v_order.paid_at,v_order.updated_at,now()) end
    )
    returning id into v_opp_id;
  else
    update public.crm_opportunities
    set contact_id=coalesce(v_contact_id,contact_id),
        cart_session_id=coalesce(cart_session_id,v_order.cart_session_id),
        order_id=v_order.id,
        conversation_id=coalesce(conversation_id,coalesce(v_order.source_conversation_id,v_order.ai_conversation_id)),
        status=v_status,
        stage=v_stage,
        current_channel=v_channel,
        value=coalesce(v_order.total,value),
        last_touch_at=greatest(last_touch_at,coalesce(v_order.updated_at,v_order.created_at,now())),
        won_at=case when v_status='won' then coalesce(won_at,v_order.paid_at,v_order.updated_at,now()) else won_at end,
        updated_at=now()
    where id=v_opp_id;
  end if;

  if v_order.cart_session_id is not null then
    update public.crm_events
    set contact_id=coalesce(contact_id,v_contact_id),opportunity_id=coalesce(opportunity_id,v_opp_id),order_id=coalesce(order_id,v_order.id)
    where tenant_id=v_tenant_id and cart_session_id=v_order.cart_session_id;
  end if;

  insert into public.crm_events(
    tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,
    cart_session_id,conversation_id,value,metadata,dedupe_key
  )
  values(
    v_tenant_id,v_contact_id,v_opp_id,'order_created',v_channel,'erp',
    coalesce(v_order.created_at,now()),v_order.id,v_order.cart_session_id,
    coalesce(v_order.source_conversation_id,v_order.ai_conversation_id),v_order.total,
    jsonb_build_object('order_code',v_order.order_code,'payment_status',v_order.payment_status),
    'order:'||v_order.id::text||':created'
  )
  on conflict do nothing;
end
$$;

create or replace function private.crm_order_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tenant_id uuid;
  v_contact_id uuid;
  v_opp_id uuid;
  v_channel text;
begin
  perform private.crm_sync_order(new.id);
  v_tenant_id:=coalesce(new.tenant_id,private.crm_active_tenant_id());
  v_contact_id:=private.crm_contact_for_order(new.id);
  select id into v_opp_id from public.crm_opportunities where tenant_id=v_tenant_id and order_id=new.id limit 1;
  v_channel:=private.crm_channel(new.sales_channel,new.source);

  if tg_op='UPDATE' then
    if new.payment_status is distinct from old.payment_status then
      insert into public.crm_events(tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,cart_session_id,conversation_id,value,metadata)
      values(v_tenant_id,v_contact_id,v_opp_id,'payment_status_changed',v_channel,'erp',now(),new.id,new.cart_session_id,coalesce(new.source_conversation_id,new.ai_conversation_id),new.total,
        jsonb_build_object('from',old.payment_status,'to',new.payment_status))
      ;
    end if;
    if new.order_status is distinct from old.order_status then
      insert into public.crm_events(tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,cart_session_id,conversation_id,value,metadata)
      values(v_tenant_id,v_contact_id,v_opp_id,'order_status_changed',v_channel,'erp',now(),new.id,new.cart_session_id,coalesce(new.source_conversation_id,new.ai_conversation_id),new.total,
        jsonb_build_object('from',old.order_status,'to',new.order_status));
    end if;
    if new.fulfillment_status is distinct from old.fulfillment_status then
      insert into public.crm_events(tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,cart_session_id,conversation_id,value,metadata)
      values(v_tenant_id,v_contact_id,v_opp_id,'fulfillment_status_changed',v_channel,'erp',now(),new.id,new.cart_session_id,coalesce(new.source_conversation_id,new.ai_conversation_id),new.total,
        jsonb_build_object('from',old.fulfillment_status,'to',new.fulfillment_status));
    end if;
    if new.delivery_status is distinct from old.delivery_status then
      insert into public.crm_events(tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,cart_session_id,conversation_id,value,metadata)
      values(v_tenant_id,v_contact_id,v_opp_id,'delivery_status_changed',v_channel,'erp',now(),new.id,new.cart_session_id,coalesce(new.source_conversation_id,new.ai_conversation_id),new.total,
        jsonb_build_object('from',old.delivery_status,'to',new.delivery_status));
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_crm_sync_order on public.orders;
create trigger trg_crm_sync_order
after insert or update of payment_status,order_status,fulfillment_status,delivery_status,status,sales_channel,source,user_id
on public.orders
for each row execute function private.crm_order_trigger();

create or replace function private.crm_sync_cart_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session public.cart_funnel_sessions%rowtype;
  v_tenant_id uuid;
  v_contact_id uuid;
  v_opp_id uuid;
  v_stage text;
  v_status text;
begin
  select * into v_session from public.cart_funnel_sessions where id=p_session_id;
  if not found then return; end if;
  v_tenant_id:=private.crm_active_tenant_id();
  if v_tenant_id is null then return; end if;

  if v_session.user_id is not null then
    v_contact_id:=private.crm_contact_for_user(v_tenant_id,v_session.user_id);
  end if;

  v_status:=case when v_session.converted_at is not null then 'won'
                 when v_session.cleared_at is not null then 'lost'
                 else 'open' end;
  v_stage:=case when v_session.converted_at is not null then 'won'
                when v_session.order_created_at is not null then 'order'
                when v_session.payment_attempted_at is not null then 'payment'
                when v_session.checkout_started_at is not null then 'checkout'
                when v_session.item_count>0 then 'cart'
                when v_session.cleared_at is not null then 'lost'
                else 'engaged' end;

  insert into public.crm_opportunities(
    tenant_id,contact_id,cart_session_id,order_id,status,stage,origin_channel,current_channel,
    value,first_touch_at,last_touch_at,won_at,lost_at,loss_reason
  )
  values(
    v_tenant_id,v_contact_id,v_session.id,v_session.order_id,v_status,v_stage,'site','site',
    coalesce(v_session.cart_value,0),coalesce(v_session.first_item_at,v_session.created_at,now()),
    v_session.last_activity_at,v_session.converted_at,
    case when v_status='lost' then coalesce(v_session.cleared_at,now()) end,
    case when v_status='lost' then 'cart_cleared' end
  )
  on conflict(tenant_id,cart_session_id) where cart_session_id is not null
  do update set
    contact_id=coalesce(excluded.contact_id,public.crm_opportunities.contact_id),
    order_id=coalesce(excluded.order_id,public.crm_opportunities.order_id),
    status=excluded.status,
    stage=excluded.stage,
    value=excluded.value,
    last_touch_at=greatest(public.crm_opportunities.last_touch_at,excluded.last_touch_at),
    won_at=coalesce(public.crm_opportunities.won_at,excluded.won_at),
    lost_at=coalesce(public.crm_opportunities.lost_at,excluded.lost_at),
    loss_reason=coalesce(excluded.loss_reason,public.crm_opportunities.loss_reason),
    updated_at=now()
  returning id into v_opp_id;

  if v_contact_id is not null then
    update public.crm_events
    set contact_id=coalesce(contact_id,v_contact_id),opportunity_id=coalesce(opportunity_id,v_opp_id)
    where tenant_id=v_tenant_id and cart_session_id=v_session.id;
  end if;

  if v_session.first_item_at is not null then
    insert into public.crm_events(tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,cart_session_id,path,value,metadata,dedupe_key)
    values(v_tenant_id,v_contact_id,v_opp_id,'cart_started','site','site',v_session.first_item_at,v_session.order_id,v_session.id,v_session.last_path,v_session.cart_value,
      jsonb_build_object('item_count',v_session.item_count),
      'cart:'||v_session.id::text||':started')
    on conflict do nothing;
  end if;

  if v_session.checkout_started_at is not null then
    insert into public.crm_events(tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,cart_session_id,path,value,metadata,dedupe_key)
    values(v_tenant_id,v_contact_id,v_opp_id,'checkout_started','site','site',v_session.checkout_started_at,v_session.order_id,v_session.id,v_session.last_path,v_session.cart_value,'{}'::jsonb,
      'cart:'||v_session.id::text||':checkout')
    on conflict do nothing;
  end if;

  if v_session.payment_attempted_at is not null or v_session.order_created_at is not null then
    insert into public.crm_events(tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,cart_session_id,path,value,metadata,dedupe_key)
    values(v_tenant_id,v_contact_id,v_opp_id,'payment_attempted','site','site',coalesce(v_session.payment_attempted_at,v_session.order_created_at),v_session.order_id,v_session.id,v_session.last_path,v_session.cart_value,
      jsonb_build_object('payment_method',v_session.payment_method),
      'cart:'||v_session.id::text||':payment')
    on conflict do nothing;
  end if;

  if v_session.converted_at is not null then
    insert into public.crm_events(tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,cart_session_id,path,value,metadata,dedupe_key)
    values(v_tenant_id,v_contact_id,v_opp_id,'purchase_completed','site','site',v_session.converted_at,v_session.order_id,v_session.id,v_session.last_path,v_session.cart_value,'{}'::jsonb,
      'cart:'||v_session.id::text||':converted')
    on conflict do nothing;
  end if;

  if v_session.cleared_at is not null and v_session.converted_at is null then
    insert into public.crm_events(tenant_id,contact_id,opportunity_id,event_type,channel,source,occurred_at,order_id,cart_session_id,path,value,metadata,dedupe_key)
    values(v_tenant_id,v_contact_id,v_opp_id,'cart_cleared','site','site',v_session.cleared_at,v_session.order_id,v_session.id,v_session.last_path,0,'{}'::jsonb,
      'cart:'||v_session.id::text||':cleared')
    on conflict do nothing;
  end if;
end
$$;

create or replace function private.crm_cart_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.crm_sync_cart_session(new.id);
  return new;
end
$$;

drop trigger if exists trg_crm_sync_cart on public.cart_funnel_sessions;
create trigger trg_crm_sync_cart
after insert or update of user_id,stage,status,cart_value,item_count,payment_method,first_item_at,checkout_started_at,payment_attempted_at,order_created_at,converted_at,cleared_at,order_id,last_activity_at,last_path
on public.cart_funnel_sessions
for each row execute function private.crm_cart_trigger();

create or replace function public.admin_crm_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_tenant_id uuid;
  v_cutoff timestamptz:=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)));
begin
  if not app_security.has_role(auth.uid(),'admin'::public.app_role) then
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    where tm.user_id=auth.uid() and tm.active=true and tm.role::text in ('owner','admin','manager')
    order by tm.created_at asc limit 1;
    if v_tenant_id is null then raise exception 'forbidden'; end if;
  else
    v_tenant_id:=private.crm_active_tenant_id();
  end if;

  return jsonb_build_object(
    'contacts',(select count(*) from public.crm_contacts where tenant_id=v_tenant_id),
    'active_opportunities',(select count(*) from public.crm_opportunities where tenant_id=v_tenant_id and status='open'),
    'won',(select count(*) from public.crm_opportunities where tenant_id=v_tenant_id and status='won' and last_touch_at>=v_cutoff),
    'lost',(select count(*) from public.crm_opportunities where tenant_id=v_tenant_id and status='lost' and last_touch_at>=v_cutoff),
    'revenue',(select coalesce(sum(value),0) from public.crm_opportunities where tenant_id=v_tenant_id and status='won' and won_at>=v_cutoff),
    'by_channel',coalesce((
      select jsonb_object_agg(current_channel,cnt)
      from (
        select current_channel,count(*) cnt
        from public.crm_opportunities
        where tenant_id=v_tenant_id and last_touch_at>=v_cutoff
        group by current_channel
      ) q
    ),'{}'::jsonb),
    'by_stage',coalesce((
      select jsonb_object_agg(stage,cnt)
      from (
        select stage,count(*) cnt
        from public.crm_opportunities
        where tenant_id=v_tenant_id and status='open'
        group by stage
      ) q
    ),'{}'::jsonb)
  );
end
$$;

revoke all on function public.admin_crm_overview(integer) from public;
revoke all on function public.admin_crm_overview(integer) from anon;
grant execute on function public.admin_crm_overview(integer) to authenticated;

do $$
declare r record;
begin
  for r in select id from public.orders loop
    perform private.crm_sync_order(r.id);
  end loop;
  for r in select id from public.cart_funnel_sessions loop
    perform private.crm_sync_cart_session(r.id);
  end loop;
end
$$;


create or replace function public.admin_crm_opportunity_list(
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null,
  p_channel text default 'all',
  p_stage text default 'all',
  p_status text default 'all'
)
returns table(
  opportunity_id uuid,
  contact_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_cpf text,
  contact_kind text,
  stage text,
  status text,
  origin_channel text,
  current_channel text,
  value numeric,
  order_id uuid,
  order_code text,
  cart_session_id uuid,
  conversation_id text,
  first_touch_at timestamptz,
  last_touch_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  loss_reason text,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_tenant_id uuid;
  v_search text:=nullif(trim(coalesce(p_search,'')),'');
begin
  if app_security.has_role(auth.uid(),'admin'::public.app_role) then
    v_tenant_id:=private.crm_active_tenant_id();
  else
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    where tm.user_id=auth.uid() and tm.active=true and tm.role::text in ('owner','admin','manager')
    order by tm.created_at asc limit 1;
  end if;
  if v_tenant_id is null then raise exception 'forbidden'; end if;

  return query
  select
    o.id,c.id,c.full_name,c.email,c.phone,c.cpf,c.contact_kind,
    o.stage,o.status,o.origin_channel,o.current_channel,o.value,
    o.order_id,ord.order_code,o.cart_session_id,o.conversation_id,
    o.first_touch_at,o.last_touch_at,o.won_at,o.lost_at,o.loss_reason,
    count(*) over()
  from public.crm_opportunities o
  left join public.crm_contacts c on c.id=o.contact_id
  left join public.orders ord on ord.id=o.order_id
  where o.tenant_id=v_tenant_id
    and (coalesce(p_channel,'all')='all' or o.current_channel=p_channel)
    and (coalesce(p_stage,'all')='all' or o.stage=p_stage)
    and (coalesce(p_status,'all')='all' or o.status=p_status)
    and (
      v_search is null
      or coalesce(c.full_name,'') ilike '%'||v_search||'%'
      or coalesce(c.email,'') ilike '%'||v_search||'%'
      or coalesce(c.phone,'') ilike '%'||v_search||'%'
      or coalesce(c.cpf,'') ilike '%'||v_search||'%'
      or coalesce(ord.order_code,'') ilike '%'||v_search||'%'
      or o.id::text ilike '%'||v_search||'%'
    )
  order by o.last_touch_at desc
  limit greatest(1,least(coalesce(p_limit,50),200))
  offset greatest(0,coalesce(p_offset,0));
end
$$;

revoke all on function public.admin_crm_opportunity_list(integer,integer,text,text,text,text) from public;
revoke all on function public.admin_crm_opportunity_list(integer,integer,text,text,text,text) from anon;
grant execute on function public.admin_crm_opportunity_list(integer,integer,text,text,text,text) to authenticated;

create or replace function public.admin_crm_timeline(
  p_contact_id uuid default null,
  p_opportunity_id uuid default null,
  p_limit integer default 300
)
returns table(
  event_id uuid,
  event_type text,
  channel text,
  source text,
  occurred_at timestamptz,
  order_id uuid,
  order_code text,
  cart_session_id uuid,
  conversation_id text,
  value numeric,
  path text,
  metadata jsonb
)
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_tenant_id uuid;
begin
  if app_security.has_role(auth.uid(),'admin'::public.app_role) then
    v_tenant_id:=private.crm_active_tenant_id();
  else
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    where tm.user_id=auth.uid() and tm.active=true and tm.role::text in ('owner','admin','manager')
    order by tm.created_at asc limit 1;
  end if;
  if v_tenant_id is null then raise exception 'forbidden'; end if;
  if p_contact_id is null and p_opportunity_id is null then raise exception 'contact_or_opportunity_required'; end if;

  return query
  select e.id,e.event_type,e.channel,e.source,e.occurred_at,e.order_id,o.order_code,
         e.cart_session_id,e.conversation_id,e.value,e.path,e.metadata
  from public.crm_events e
  left join public.orders o on o.id=e.order_id
  where e.tenant_id=v_tenant_id
    and (
      (p_contact_id is not null and e.contact_id=p_contact_id)
      or (p_contact_id is null and p_opportunity_id is not null and e.opportunity_id=p_opportunity_id)
    )
  order by e.occurred_at desc
  limit greatest(1,least(coalesce(p_limit,300),1000));
end
$$;

revoke all on function public.admin_crm_timeline(uuid,uuid,integer) from public;
revoke all on function public.admin_crm_timeline(uuid,uuid,integer) from anon;
grant execute on function public.admin_crm_timeline(uuid,uuid,integer) to authenticated;
