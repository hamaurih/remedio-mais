create table if not exists public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  order_id uuid unique references public.orders(id) on delete set null,
  pos_sale_id uuid references public.pos_sales(id) on delete set null,
  description text not null,
  customer_name text,
  customer_document text,
  issue_date date not null default current_date,
  due_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  received_amount numeric(14,2) not null default 0 check (received_amount >= 0 and received_amount <= amount),
  status text not null default 'draft' check (status in ('draft','pending','approved','partially_received','received','overdue','cancelled')),
  payment_method text,
  sales_channel text,
  cost_center text,
  notes text,
  external_reference text,
  approved_by uuid,
  approved_at timestamptz,
  received_by uuid,
  received_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_receivable_received_not_above_amount check (received_amount <= amount)
);

create table if not exists public.accounts_receivable_installments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts_receivable(id) on delete cascade,
  installment_no integer not null check (installment_no > 0),
  due_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  received_amount numeric(14,2) not null default 0 check (received_amount >= 0 and received_amount <= amount),
  status text not null default 'pending' check (status in ('pending','received','overdue','cancelled')),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique(account_id, installment_no)
);

create table if not exists public.cash_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  direction text not null check (direction in ('inflow','outflow')),
  amount numeric(14,2) not null check (amount > 0),
  occurred_at timestamptz not null default now(),
  payment_method text,
  source_type text not null,
  source_id uuid,
  accounts_receivable_id uuid references public.accounts_receivable(id) on delete set null,
  accounts_payable_id uuid references public.accounts_payable(id) on delete set null,
  category text,
  description text not null,
  status text not null default 'posted' check (status in ('posted','reversed')),
  idempotency_key text unique,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.accounts_receivable enable row level security;
alter table public.accounts_receivable_installments enable row level security;
alter table public.cash_ledger enable row level security;

drop policy if exists "accounts_receivable_admin_select" on public.accounts_receivable;
create policy "accounts_receivable_admin_select" on public.accounts_receivable for select to authenticated
using (private.has_tenant_role(tenant_id, auth.uid(), array['owner','admin','manager']));
drop policy if exists "accounts_receivable_admin_insert" on public.accounts_receivable;
create policy "accounts_receivable_admin_insert" on public.accounts_receivable for insert to authenticated
with check (private.has_tenant_role(tenant_id, auth.uid(), array['owner','admin','manager']));
drop policy if exists "accounts_receivable_admin_update" on public.accounts_receivable;
create policy "accounts_receivable_admin_update" on public.accounts_receivable for update to authenticated
using (private.has_tenant_role(tenant_id, auth.uid(), array['owner','admin','manager']))
with check (private.has_tenant_role(tenant_id, auth.uid(), array['owner','admin','manager']));
drop policy if exists "accounts_receivable_admin_delete" on public.accounts_receivable;
create policy "accounts_receivable_admin_delete" on public.accounts_receivable for delete to authenticated
using (private.has_tenant_role(tenant_id, auth.uid(), array['owner','admin','manager']));

drop policy if exists "accounts_receivable_installments_admin" on public.accounts_receivable_installments;
create policy "accounts_receivable_installments_admin" on public.accounts_receivable_installments for all to authenticated
using (exists (select 1 from public.accounts_receivable a where a.id=account_id and private.has_tenant_role(a.tenant_id,auth.uid(),array['owner','admin','manager'])))
with check (exists (select 1 from public.accounts_receivable a where a.id=account_id and private.has_tenant_role(a.tenant_id,auth.uid(),array['owner','admin','manager'])));

drop policy if exists "cash_ledger_admin_select" on public.cash_ledger;
create policy "cash_ledger_admin_select" on public.cash_ledger for select to authenticated
using (private.has_tenant_role(tenant_id, auth.uid(), array['owner','admin','manager']));
drop policy if exists "cash_ledger_admin_insert" on public.cash_ledger;
create policy "cash_ledger_admin_insert" on public.cash_ledger for insert to authenticated
with check (private.has_tenant_role(tenant_id, auth.uid(), array['owner','admin','manager']));

create index if not exists accounts_receivable_tenant_status_due_idx on public.accounts_receivable(tenant_id,status,due_date);
create index if not exists accounts_receivable_order_idx on public.accounts_receivable(order_id);
create index if not exists cash_ledger_tenant_date_idx on public.cash_ledger(tenant_id,occurred_at desc);
create index if not exists cash_ledger_source_idx on public.cash_ledger(source_type,source_id);

create or replace function private.create_ar_installment()
returns trigger language plpgsql security definer set search_path=public,private
as $$
begin
  insert into public.accounts_receivable_installments(account_id,installment_no,due_date,amount)
  values(new.id,1,new.due_date,new.amount)
  on conflict(account_id,installment_no) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_accounts_receivable_installment on public.accounts_receivable;
create trigger trg_accounts_receivable_installment after insert on public.accounts_receivable
for each row execute function private.create_ar_installment();

create or replace function private.create_ar_from_paid_order()
returns trigger language plpgsql security definer set search_path=public,private
as $$
begin
  if new.tenant_id is not null and coalesce(new.total,0)>0
     and new.payment_status in ('approved','paid','succeeded')
     and (old.payment_status is distinct from new.payment_status) then
    insert into public.accounts_receivable(
      tenant_id,store_id,order_id,description,customer_name,issue_date,due_date,
      amount,received_amount,status,payment_method,sales_channel,external_reference,received_at
    )
    values(
      new.tenant_id,new.store_id,new.id,'Venda #'||coalesce(new.order_code,left(new.id::text,8)),
      new.customer_name,current_date,current_date,new.total,new.total,'received',
      new.payment_method,new.sales_channel,new.cielo_payment_id,coalesce(new.paid_at,now())
    )
    on conflict(order_id) do nothing;
    insert into public.cash_ledger(
      tenant_id,store_id,direction,amount,occurred_at,payment_method,source_type,source_id,
      accounts_receivable_id,category,description,idempotency_key
    )
    select new.tenant_id,new.store_id,'inflow',new.total,coalesce(new.paid_at,now()),new.payment_method,
      'order',new.id,ar.id,'Venda', 'Venda recebida — pedido '||coalesce(new.order_code,left(new.id::text,8)),
      'order:'||new.id::text
    from public.accounts_receivable ar
    where ar.order_id=new.id
    on conflict(idempotency_key) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_create_ar_from_paid_order on public.orders;
create trigger trg_create_ar_from_paid_order after update of payment_status on public.orders
for each row execute function private.create_ar_from_paid_order();

create or replace function public.update_accounts_receivable(
  _account_id uuid,_description text,_customer_name text,_due_date date,_amount numeric,
  _payment_method text default null,_sales_channel text default null,_cost_center text default null,_notes text default null
)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare a public.accounts_receivable%rowtype;
begin
 select * into a from public.accounts_receivable where id=_account_id for update;
 if not found then raise exception 'Conta a receber não encontrada'; end if;
 if not private.has_tenant_role(a.tenant_id,auth.uid(),array['owner','admin','manager']) then raise exception 'Sem permissão'; end if;
 if a.status not in ('draft','pending') then raise exception 'Somente contas pendentes podem ser editadas'; end if;
 if coalesce(trim(_description),'')='' or _due_date is null or coalesce(_amount,0)<=0 then raise exception 'Descrição, vencimento e valor são obrigatórios'; end if;
 update public.accounts_receivable set description=trim(_description),customer_name=nullif(trim(coalesce(_customer_name,'')),''),
 due_date=_due_date,amount=_amount,payment_method=nullif(trim(coalesce(_payment_method,'')),''),
 sales_channel=nullif(trim(coalesce(_sales_channel,'')),''),
 cost_center=nullif(trim(coalesce(_cost_center,'')),''),
 notes=nullif(trim(coalesce(_notes,'')),''),
 updated_at=now() where id=_account_id;
 delete from public.accounts_receivable_installments where account_id=_account_id;
 insert into public.accounts_receivable_installments(account_id,installment_no,due_date,amount) values(_account_id,1,_due_date,_amount);
 return jsonb_build_object('ok',true,'account_id',_account_id);
end;
$$;

create or replace function public.set_accounts_receivable_installments(_account_id uuid,_installment_count integer,_first_due_date date,_interval_days integer default 30)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare a public.accounts_receivable%rowtype;i integer;v_amount numeric(14,2);v_sum numeric(14,2);
begin
 select * into a from public.accounts_receivable where id=_account_id for update;
 if not found then raise exception 'Conta a receber não encontrada'; end if;
 if not private.has_tenant_role(a.tenant_id,auth.uid(),array['owner','admin','manager']) then raise exception 'Sem permissão'; end if;
 if a.status not in ('draft','pending') then raise exception 'Somente contas pendentes podem ser parceladas'; end if;
 if _installment_count is null or _installment_count<1 or _installment_count>36 then raise exception 'Informe entre 1 e 36 parcelas'; end if;
 delete from public.accounts_receivable_installments where account_id=_account_id;
 v_amount=round(a.amount/_installment_count,2);v_sum=0;
 for i in 1.._installment_count loop
   if i=_installment_count then v_amount=a.amount-v_sum; end if;
   insert into public.accounts_receivable_installments(account_id,installment_no,due_date,amount)
   values(_account_id,i,_first_due_date+((_interval_days*(i-1))::integer),v_amount);
   v_sum=v_sum+v_amount;
 end loop;
 update public.accounts_receivable set due_date=_first_due_date,updated_at=now() where id=_account_id;
 return jsonb_build_object('ok',true,'installments',_installment_count);
end;
$$;

create or replace function public.approve_accounts_receivable(_account_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare a public.accounts_receivable%rowtype;
begin
 select * into a from public.accounts_receivable where id=_account_id for update;
 if not found then raise exception 'Conta a receber não encontrada'; end if;
 if not private.has_tenant_role(a.tenant_id,auth.uid(),array['owner','admin','manager']) then raise exception 'Sem permissão'; end if;
 if a.status not in ('draft','pending') then raise exception 'Conta não está pendente'; end if;
 update public.accounts_receivable set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=_account_id;
 return jsonb_build_object('ok',true,'status','approved');
end;
$$;

create or replace function public.receive_accounts_receivable(_account_id uuid,_payment_method text default null,_received_amount numeric default null)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare a public.accounts_receivable%rowtype;v_amount numeric(14,2);v_new_paid numeric(14,2);
begin
 select * into a from public.accounts_receivable where id=_account_id for update;
 if not found then raise exception 'Conta a receber não encontrada'; end if;
 if not private.has_tenant_role(a.tenant_id,auth.uid(),array['owner','admin','manager']) then raise exception 'Sem permissão'; end if;
 if a.status not in ('approved','partially_received') then raise exception 'A conta precisa estar aprovada'; end if;
 v_amount=coalesce(_received_amount,a.amount-a.received_amount);
 if v_amount<=0 or v_amount>a.amount-a.received_amount then raise exception 'Valor recebido inválido'; end if;
 v_new_paid=a.received_amount+v_amount;
 update public.accounts_receivable set received_amount=v_new_paid,status=case when v_new_paid>=amount then 'received' else 'partially_received' end,
 payment_method=coalesce(_payment_method,payment_method),received_by=auth.uid(),
 received_at=case when v_new_paid>=amount then now() else received_at end,updated_at=now() where id=a.id;
 update public.accounts_receivable_installments set received_amount=least(amount,received_amount+v_amount),
 status=case when received_amount+v_amount>=amount then 'received' else status end,
 received_at=case when received_amount+v_amount>=amount then now() else received_at end
 where account_id=a.id and installment_no=1;
 insert into public.cash_ledger(tenant_id,store_id,direction,amount,occurred_at,payment_method,source_type,source_id,accounts_receivable_id,category,description,idempotency_key,created_by)
 values(a.tenant_id,a.store_id,'inflow',v_amount,now(),coalesce(_payment_method,a.payment_method),'accounts_receivable',a.id,a.id,'Recebimento','Recebimento — '||a.description,'ar:'||a.id::text||':'||v_new_paid::text,auth.uid())
 on conflict(idempotency_key) do nothing;
 return jsonb_build_object('ok',true,'status',case when v_new_paid>=a.amount then 'received' else 'partially_received' end);
end;
$$;

create or replace function public.cancel_accounts_receivable(_account_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare a public.accounts_receivable%rowtype;
begin
 select * into a from public.accounts_receivable where id=_account_id for update;
 if not found then raise exception 'Conta a receber não encontrada'; end if;
 if not private.has_tenant_role(a.tenant_id,auth.uid(),array['owner','admin','manager']) then raise exception 'Sem permissão'; end if;
 if a.status in ('received','partially_received') then raise exception 'Conta já recebida e não pode ser cancelada'; end if;
 update public.accounts_receivable set status='cancelled',updated_at=now() where id=_account_id;
 update public.accounts_receivable_installments set status='cancelled' where account_id=_account_id;
 return jsonb_build_object('ok',true,'status','cancelled');
end;
$$;

create or replace function public.pay_accounts_payable(_account_id uuid,_payment_method text default null,_paid_amount numeric default null)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare a public.accounts_payable%rowtype;v_amount numeric(14,2);v_new_paid numeric(14,2);
begin
 select * into a from public.accounts_payable where id=_account_id for update;
 if not found then raise exception 'Conta a pagar não encontrada'; end if;
 if not private.has_tenant_role(a.tenant_id,auth.uid(),array['owner','admin','manager']) then raise exception 'Sem permissão'; end if;
 if a.status not in ('approved','partially_paid') then raise exception 'A conta precisa estar aprovada para pagamento'; end if;
 v_amount=coalesce(_paid_amount,a.amount-a.paid_amount);
 if v_amount<=0 or v_amount>a.amount-a.paid_amount then raise exception 'Valor de pagamento inválido'; end if;
 v_new_paid=a.paid_amount+v_amount;
 update public.accounts_payable set paid_amount=v_new_paid,status=case when v_new_paid>=amount then 'paid' else 'partially_paid' end,
 payment_method=coalesce(_payment_method,payment_method),paid_by=auth.uid(),
 paid_at=case when v_new_paid>=amount then now() else paid_at end,updated_at=now() where id=a.id;
 update public.accounts_payable_installments set paid_amount=least(amount,paid_amount+v_amount),
 status=case when paid_amount+v_amount>=amount then 'paid' else status end,
 paid_at=case when paid_amount+v_amount>=amount then now() else paid_at end
 where account_id=a.id and installment_no=1;
 insert into public.cash_ledger(tenant_id,store_id,direction,amount,occurred_at,payment_method,source_type,source_id,accounts_payable_id,category,description,idempotency_key,created_by)
 values(a.tenant_id,a.store_id,'outflow',v_amount,now(),coalesce(_payment_method,a.payment_method),'accounts_payable',a.id,a.id,'Pagamento de fornecedor','Pagamento — '||a.description,'ap:'||a.id::text||':'||v_new_paid::text,auth.uid())
 on conflict(idempotency_key) do nothing;
 return jsonb_build_object('ok',true,'status',case when v_new_paid>=a.amount then 'paid' else 'partially_paid' end);
end;
$$;

grant execute on function public.update_accounts_receivable(uuid,text,text,date,numeric,text,text,text,text) to authenticated;
grant execute on function public.set_accounts_receivable_installments(uuid,integer,date,integer) to authenticated;
grant execute on function public.approve_accounts_receivable(uuid) to authenticated;
grant execute on function public.receive_accounts_receivable(uuid,text,numeric) to authenticated;
grant execute on function public.cancel_accounts_receivable(uuid) to authenticated;
grant execute on function public.pay_accounts_payable(uuid,text,numeric) to authenticated;