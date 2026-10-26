create table if not exists public.inventory_loss_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  lot_id uuid null references public.inventory_lots(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  reason_type text not null check (reason_type in ('expiry','damage','breakage','theft','quality','other')),
  reason text null,
  unit_cost numeric(14,4) null check (unit_cost is null or unit_cost >= 0),
  total_value numeric(14,2) not null default 0 check (total_value >= 0),
  ledger_id uuid null references public.inventory_ledger(id) on delete restrict,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists inventory_loss_events_store_created_idx
  on public.inventory_loss_events(tenant_id,store_id,created_at desc);
create index if not exists inventory_loss_events_product_idx
  on public.inventory_loss_events(product_id,created_at desc);
create index if not exists inventory_loss_events_lot_idx
  on public.inventory_loss_events(lot_id,created_at desc) where lot_id is not null;

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  count_number bigint generated always as identity,
  mode text not null default 'products' check (mode in ('products','lots')),
  status text not null default 'counting' check (status in ('counting','finalized','cancelled')),
  notes text null,
  item_count integer not null default 0,
  variance_items integer not null default 0,
  variance_units numeric(14,3) not null default 0,
  created_by uuid null references auth.users(id),
  finalized_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  finalized_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists inventory_counts_store_status_idx
  on public.inventory_counts(tenant_id,store_id,status,created_at desc);

create table if not exists public.inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.inventory_counts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  lot_id uuid null references public.inventory_lots(id) on delete restrict,
  expected_qty numeric(14,3) not null default 0,
  counted_qty numeric(14,3) null check (counted_qty is null or counted_qty >= 0),
  variance_qty numeric(14,3) generated always as (
    case when counted_qty is null then null else counted_qty - expected_qty end
  ) stored,
  reason text null,
  applied boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(count_id,product_id,lot_id)
);

create index if not exists inventory_count_items_count_idx
  on public.inventory_count_items(count_id,product_id);
create index if not exists inventory_count_items_pending_idx
  on public.inventory_count_items(count_id,applied)
  where applied=false;

alter table public.inventory_loss_events enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_items enable row level security;

create policy inventory_loss_events_member_read_v1
on public.inventory_loss_events for select to authenticated
using (private.is_tenant_member(tenant_id,auth.uid()));

create policy inventory_loss_events_manage_v1
on public.inventory_loss_events for all to authenticated
using (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']))
with check (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']));

create policy inventory_counts_member_read_v1
on public.inventory_counts for select to authenticated
using (private.is_tenant_member(tenant_id,auth.uid()));

create policy inventory_counts_manage_v1
on public.inventory_counts for all to authenticated
using (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']))
with check (private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory']));

create policy inventory_count_items_member_read_v1
on public.inventory_count_items for select to authenticated
using (
  exists (
    select 1 from public.inventory_counts c
    where c.id=inventory_count_items.count_id
      and private.is_tenant_member(c.tenant_id,auth.uid())
  )
);

create policy inventory_count_items_manage_v1
on public.inventory_count_items for all to authenticated
using (
  exists (
    select 1 from public.inventory_counts c
    where c.id=inventory_count_items.count_id
      and private.has_tenant_role(c.tenant_id,auth.uid(),array['owner','admin','manager','inventory'])
  )
)
with check (
  exists (
    select 1 from public.inventory_counts c
    where c.id=inventory_count_items.count_id
      and private.has_tenant_role(c.tenant_id,auth.uid(),array['owner','admin','manager','inventory'])
  )
);

create policy inventory_ledger_manage_inventory_v1
on public.inventory_ledger for insert to authenticated
with check (
  private.has_tenant_role(tenant_id,auth.uid(),array['owner','admin','manager','inventory'])
  and created_by=auth.uid()
);

create or replace function public.admin_inventory_control(_limit integer default 1000)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_tenant_id uuid;
  v_store_id uuid;
  v_store_name text;
  v_limit integer := least(greatest(coalesce(_limit,1000),1),3000);
  v_result jsonb;
begin
  select tm.tenant_id,
         coalesce(tm.store_id,st.id),
         coalesce(member_store.name,st.name,'Unidade principal')
  into v_tenant_id,v_store_id,v_store_name
  from public.tenant_memberships tm
  left join public.stores member_store on member_store.id=tm.store_id
  left join lateral (
    select s.id,s.name
    from public.stores s
    where s.tenant_id=tm.tenant_id and s.active=true
    order by s.is_headquarters desc nulls last,s.created_at asc
    limit 1
  ) st on true
  where tm.user_id=auth.uid() and tm.active=true
  order by case when tm.role::text in ('owner','admin') then 0 else 1 end,tm.created_at asc
  limit 1;

  if v_tenant_id is null or v_store_id is null then
    raise exception 'Usuário sem vínculo ativo com unidade';
  end if;

  with lot_balances as (
    select
      il.id as lot_id,
      il.product_id,
      il.batch_number,
      il.expiry_date,
      il.manufacture_date,
      il.unit_cost,
      il.created_at,
      coalesce(sum(l.on_hand_delta),0)::numeric as quantity
    from public.inventory_lots il
    left join public.inventory_ledger l
      on l.tenant_id=il.tenant_id
     and l.store_id=il.store_id
     and l.lot_id=il.id
    where il.tenant_id=v_tenant_id
      and il.store_id=v_store_id
      and il.active=true
    group by il.id
  ), lot_rows as (
    select
      lb.*,
      p.name as product_name,
      p.barcode,
      p.sku,
      p.laboratory,
      p.requires_prescription,
      p.controlled,
      case
        when lb.expiry_date is null then 'sem_validade'
        when lb.expiry_date < current_date then 'vencido'
        when lb.expiry_date <= current_date + 30 then 'vence_30'
        when lb.expiry_date <= current_date + 60 then 'vence_60'
        when lb.expiry_date <= current_date + 90 then 'vence_90'
        else 'ok'
      end as expiry_status,
      case when lb.expiry_date is null then null else lb.expiry_date-current_date end as days_to_expiry
    from lot_balances lb
    join public.products p on p.id=lb.product_id
    where lb.quantity>0
  )
  select jsonb_build_object(
    'store',jsonb_build_object('id',v_store_id,'name',v_store_name),
    'summary',jsonb_build_object(
      'lot_count',(select count(*) from lot_rows),
      'expired_lots',(select count(*) from lot_rows where expiry_status='vencido'),
      'expiring_30',(select count(*) from lot_rows where expiry_status='vence_30'),
      'expiring_60',(select count(*) from lot_rows where expiry_status='vence_60'),
      'expiring_90',(select count(*) from lot_rows where expiry_status='vence_90'),
      'without_expiry',(select count(*) from lot_rows where expiry_status='sem_validade'),
      'loss_30d',(
        select coalesce(sum(total_value),0)
        from public.inventory_loss_events
        where tenant_id=v_tenant_id and store_id=v_store_id and created_at>=now()-interval '30 days'
      ),
      'open_counts',(
        select count(*) from public.inventory_counts
        where tenant_id=v_tenant_id and store_id=v_store_id and status='counting'
      )
    ),
    'lots',coalesce((
      select jsonb_agg(jsonb_build_object(
        'lot_id',lot_id,
        'product_id',product_id,
        'product_name',product_name,
        'barcode',barcode,
        'sku',sku,
        'laboratory',laboratory,
        'batch_number',batch_number,
        'manufacture_date',manufacture_date,
        'expiry_date',expiry_date,
        'unit_cost',unit_cost,
        'quantity',quantity,
        'requires_prescription',requires_prescription,
        'controlled',controlled,
        'expiry_status',expiry_status,
        'days_to_expiry',days_to_expiry
      ) order by expiry_date asc nulls last,product_name asc,batch_number asc)
      from (select * from lot_rows order by expiry_date asc nulls last limit v_limit) x
    ),'[]'::jsonb),
    'recent_losses',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',le.id,
        'product_id',le.product_id,
        'product_name',p.name,
        'lot_id',le.lot_id,
        'batch_number',il.batch_number,
        'quantity',le.quantity,
        'reason_type',le.reason_type,
        'reason',le.reason,
        'unit_cost',le.unit_cost,
        'total_value',le.total_value,
        'created_at',le.created_at
      ) order by le.created_at desc)
      from (
        select * from public.inventory_loss_events
        where tenant_id=v_tenant_id and store_id=v_store_id
        order by created_at desc limit 100
      ) le
      join public.products p on p.id=le.product_id
      left join public.inventory_lots il on il.id=le.lot_id
    ),'[]'::jsonb),
    'counts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,
        'count_number',c.count_number,
        'mode',c.mode,
        'status',c.status,
        'notes',c.notes,
        'item_count',c.item_count,
        'variance_items',c.variance_items,
        'variance_units',c.variance_units,
        'created_at',c.created_at,
        'finalized_at',c.finalized_at
      ) order by c.created_at desc)
      from (
        select * from public.inventory_counts
        where tenant_id=v_tenant_id and store_id=v_store_id
        order by created_at desc limit 50
      ) c
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.record_inventory_loss(
  _product_id uuid,
  _lot_id uuid,
  _quantity numeric,
  _reason_type text,
  _reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_tenant_id uuid;
  v_store_id uuid;
  v_lot_qty numeric := 0;
  v_available numeric := 0;
  v_cost numeric := 0;
  v_event_id uuid;
  v_ledger_id uuid;
begin
  if coalesce(_quantity,0)<=0 then raise exception 'Quantidade deve ser maior que zero'; end if;
  if _reason_type not in ('expiry','damage','breakage','theft','quality','other') then raise exception 'Motivo de perda inválido'; end if;

  select tm.tenant_id,coalesce(tm.store_id,st.id)
  into v_tenant_id,v_store_id
  from public.tenant_memberships tm
  left join lateral (
    select s.id from public.stores s
    where s.tenant_id=tm.tenant_id and s.active=true
    order by s.is_headquarters desc nulls last,s.created_at asc limit 1
  ) st on true
  where tm.user_id=auth.uid() and tm.active=true
    and tm.role::text in ('owner','admin','manager','inventory')
  order by tm.created_at asc limit 1;

  if v_tenant_id is null or v_store_id is null then raise exception 'Sem permissão para registrar perda'; end if;

  select coalesce(ib.on_hand,0)
  into v_available
  from public.inventory_balances ib
  where ib.tenant_id=v_tenant_id and ib.store_id=v_store_id and ib.product_id=_product_id
  for update;

  if _lot_id is not null then
    if not exists (
      select 1 from public.inventory_lots il
      where il.id=_lot_id and il.tenant_id=v_tenant_id and il.store_id=v_store_id and il.product_id=_product_id
    ) then raise exception 'Lote inválido para o produto/unidade'; end if;

    select coalesce(sum(on_hand_delta),0)
    into v_lot_qty
    from public.inventory_ledger
    where tenant_id=v_tenant_id and store_id=v_store_id and product_id=_product_id and lot_id=_lot_id;

    if v_lot_qty<_quantity then raise exception 'Quantidade da perda é maior que o saldo do lote'; end if;

    select coalesce(unit_cost,0) into v_cost from public.inventory_lots where id=_lot_id;
  else
    if coalesce(v_available,0)<_quantity then raise exception 'Quantidade da perda é maior que o saldo disponível'; end if;
  end if;

  insert into public.inventory_loss_events(
    tenant_id,store_id,product_id,lot_id,quantity,reason_type,reason,unit_cost,total_value,created_by
  ) values (
    v_tenant_id,v_store_id,_product_id,_lot_id,_quantity,_reason_type,nullif(trim(coalesce(_reason,'')),''),
    nullif(v_cost,0),round(_quantity*coalesce(v_cost,0),2),auth.uid()
  ) returning id into v_event_id;

  insert into public.inventory_ledger(
    tenant_id,store_id,product_id,lot_id,movement_type,on_hand_delta,reserved_delta,unit_cost,
    source_type,source_id,reference,reason,idempotency_key,metadata,created_by
  ) values (
    v_tenant_id,v_store_id,_product_id,_lot_id,
    case when _reason_type='expiry' then 'expiry' else 'loss' end,
    -_quantity,0,nullif(v_cost,0),
    'inventory_loss',v_event_id::text,'Perda de estoque',nullif(trim(coalesce(_reason,'')),''),
    'inventory_loss:'||v_event_id::text,
    jsonb_build_object('reason_type',_reason_type),auth.uid()
  ) returning id into v_ledger_id;

  update public.inventory_loss_events set ledger_id=v_ledger_id where id=v_event_id;

  return jsonb_build_object('ok',true,'loss_id',v_event_id,'ledger_id',v_ledger_id);
end;
$function$;

create or replace function public.start_inventory_count(
  _mode text default 'products',
  _notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_tenant_id uuid;
  v_store_id uuid;
  v_count_id uuid;
  v_number bigint;
  v_items integer := 0;
begin
  if _mode not in ('products','lots') then raise exception 'Modo de inventário inválido'; end if;

  select tm.tenant_id,coalesce(tm.store_id,st.id)
  into v_tenant_id,v_store_id
  from public.tenant_memberships tm
  left join lateral (
    select s.id from public.stores s
    where s.tenant_id=tm.tenant_id and s.active=true
    order by s.is_headquarters desc nulls last,s.created_at asc limit 1
  ) st on true
  where tm.user_id=auth.uid() and tm.active=true
    and tm.role::text in ('owner','admin','manager','inventory')
  order by tm.created_at asc limit 1;

  if v_tenant_id is null or v_store_id is null then raise exception 'Sem permissão para iniciar inventário'; end if;

  if exists (
    select 1 from public.inventory_counts
    where tenant_id=v_tenant_id and store_id=v_store_id and status='counting'
  ) then raise exception 'Já existe um inventário em andamento nesta unidade'; end if;

  insert into public.inventory_counts(tenant_id,store_id,mode,status,notes,created_by)
  values(v_tenant_id,v_store_id,_mode,'counting',nullif(trim(coalesce(_notes,'')),''),auth.uid())
  returning id,count_number into v_count_id,v_number;

  if _mode='products' then
    insert into public.inventory_count_items(count_id,product_id,lot_id,expected_qty)
    select v_count_id,ib.product_id,null,ib.on_hand
    from public.inventory_balances ib
    join public.products p on p.id=ib.product_id
    where ib.tenant_id=v_tenant_id and ib.store_id=v_store_id
      and (ib.on_hand<>0 or coalesce(p.active,true)=true)
    order by p.name;
  else
    insert into public.inventory_count_items(count_id,product_id,lot_id,expected_qty)
    select v_count_id,il.product_id,il.id,coalesce(sum(l.on_hand_delta),0)
    from public.inventory_lots il
    left join public.inventory_ledger l
      on l.tenant_id=il.tenant_id and l.store_id=il.store_id and l.lot_id=il.id
    where il.tenant_id=v_tenant_id and il.store_id=v_store_id and il.active=true
    group by il.id
    having coalesce(sum(l.on_hand_delta),0)>0
    order by il.expiry_date asc nulls last,il.created_at asc;
  end if;

  get diagnostics v_items=row_count;
  update public.inventory_counts set item_count=v_items,updated_at=now() where id=v_count_id;

  return jsonb_build_object('ok',true,'count_id',v_count_id,'count_number',v_number,'items',v_items,'mode',_mode);
end;
$function$;

create or replace function public.finalize_inventory_count(_count_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_count public.inventory_counts%rowtype;
  v_item public.inventory_count_items%rowtype;
  v_variance_items integer := 0;
  v_variance_units numeric := 0;
begin
  select * into v_count from public.inventory_counts where id=_count_id for update;
  if not found then raise exception 'Inventário não encontrado'; end if;
  if not private.has_tenant_role(v_count.tenant_id,auth.uid(),array['owner','admin','manager','inventory']) then
    raise exception 'Sem permissão para finalizar inventário';
  end if;
  if v_count.status<>'counting' then raise exception 'Inventário não está em andamento'; end if;

  if exists (
    select 1 from public.inventory_count_items
    where count_id=v_count.id and counted_qty is null
  ) then raise exception 'Existem itens sem contagem informada'; end if;

  for v_item in
    select * from public.inventory_count_items
    where count_id=v_count.id
    order by created_at,id
    for update
  loop
    if abs(coalesce(v_item.variance_qty,0))>0.0001 then
      insert into public.inventory_ledger(
        tenant_id,store_id,product_id,lot_id,movement_type,on_hand_delta,reserved_delta,
        source_type,source_id,reference,reason,idempotency_key,metadata,created_by
      ) values (
        v_count.tenant_id,v_count.store_id,v_item.product_id,v_item.lot_id,'inventory_count',
        v_item.variance_qty,0,
        'inventory_count',v_count.id::text,'Inventário físico #'||v_count.count_number::text,
        nullif(trim(coalesce(v_item.reason,'')),''),
        'inventory_count:'||v_count.id::text||':item:'||v_item.id::text,
        jsonb_build_object('expected_qty',v_item.expected_qty,'counted_qty',v_item.counted_qty),
        auth.uid()
      ) on conflict do nothing;

      v_variance_items:=v_variance_items+1;
      v_variance_units:=v_variance_units+abs(v_item.variance_qty);
    end if;

    update public.inventory_count_items set applied=true,updated_at=now() where id=v_item.id;
  end loop;

  update public.inventory_counts
  set status='finalized',
      variance_items=v_variance_items,
      variance_units=v_variance_units,
      finalized_by=auth.uid(),
      finalized_at=now(),
      updated_at=now()
  where id=v_count.id;

  return jsonb_build_object(
    'ok',true,
    'count_id',v_count.id,
    'status','finalized',
    'variance_items',v_variance_items,
    'variance_units',v_variance_units
  );
end;
$function$;

revoke all on function public.admin_inventory_control(integer) from public;
revoke all on function public.admin_inventory_control(integer) from anon;
grant execute on function public.admin_inventory_control(integer) to authenticated;

revoke all on function public.record_inventory_loss(uuid,uuid,numeric,text,text) from public;
revoke all on function public.record_inventory_loss(uuid,uuid,numeric,text,text) from anon;
grant execute on function public.record_inventory_loss(uuid,uuid,numeric,text,text) to authenticated;

revoke all on function public.start_inventory_count(text,text) from public;
revoke all on function public.start_inventory_count(text,text) from anon;
grant execute on function public.start_inventory_count(text,text) to authenticated;

revoke all on function public.finalize_inventory_count(uuid) from public;
revoke all on function public.finalize_inventory_count(uuid) from anon;
grant execute on function public.finalize_inventory_count(uuid) to authenticated;
