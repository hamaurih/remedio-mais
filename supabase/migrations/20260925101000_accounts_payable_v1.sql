create table if not exists public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  store_id uuid references public.stores(id) on delete set null,
  goods_receipt_id uuid unique references public.goods_receipts(id) on delete set null,
  description text not null,
  document_number text,
  issue_date date not null default current_date,
  due_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0 and paid_amount <= amount),
  status text not null default 'draft' check (status in ('draft','pending','approved','partially_paid','paid','overdue','cancelled')),
  payment_method text,
  cost_center text,
  notes text,
  attachment_url text,
  approved_by uuid,
  approved_at timestamptz,
  paid_by uuid,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_payable_paid_not_above_amount check (paid_amount <= amount)
);

create table if not exists public.accounts_payable_installments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts_payable(id) on delete cascade,
  installment_no integer not null check (installment_no > 0),
  due_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0 and paid_amount <= amount),
  status text not null default 'pending' check (status in ('pending','paid','overdue','cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(account_id, installment_no)
);

alter table public.accounts_payable enable row level security;
alter table public.accounts_payable_installments enable row level security;

drop policy if exists "accounts_payable_select_admin" on public.accounts_payable;
create policy "accounts_payable_select_admin" on public.accounts_payable for select to authenticated
using (private.has_tenant_role(tenant_id, auth.uid(), array['owner','admin','manager']));

drop policy if exists "accounts_payable_insert_admin" on public.accounts_payable;
create policy "accounts_payable_insert_admin" on public.accounts_payable for insert to authenticated
with check (private.has_tenant_role(tenant_id, auth.uid(), array['owner','admin','manager']));

drop policy if exists "accounts_payable_update_admin" on public.accounts_payable;
create policy "accounts_payable_update_admin" on public.accounts_payable for update to authenticated
using (private.has_tenant_role(tenant_id, auth.uid(), array['owner','admin','manager']))
with check (private.has_tenant_role(tenant_id, auth.uid(), array['owner','admin','manager']));

drop policy if exists "accounts_payable_delete_admin" on public.accounts_payable;
create policy "accounts_payable_delete_admin" on public.accounts_payable for delete to authenticated
using (private.has_tenant_role(tenant_id, auth.uid(), array['owner','admin','manager']));

drop policy if exists "accounts_payable_installments_select_admin" on public.accounts_payable_installments;
create policy "accounts_payable_installments_select_admin" on public.accounts_payable_installments for select to authenticated
using (exists (select 1 from public.accounts_payable a where a.id = account_id and private.has_tenant_role(a.tenant_id, auth.uid(), array['owner','admin','manager'])));

drop policy if exists "accounts_payable_installments_write_admin" on public.accounts_payable_installments;
create policy "accounts_payable_installments_write_admin" on public.accounts_payable_installments for all to authenticated
using (exists (select 1 from public.accounts_payable a where a.id = account_id and private.has_tenant_role(a.tenant_id, auth.uid(), array['owner','admin','manager'])))
with check (exists (select 1 from public.accounts_payable a where a.id = account_id and private.has_tenant_role(a.tenant_id, auth.uid(), array['owner','admin','manager'])));

create index if not exists accounts_payable_tenant_status_due_idx on public.accounts_payable(tenant_id,status,due_date);
create index if not exists accounts_payable_supplier_idx on public.accounts_payable(supplier_id);
create index if not exists accounts_payable_receipt_idx on public.accounts_payable(goods_receipt_id);

create or replace function private.create_payable_installment()
returns trigger language plpgsql security definer set search_path = public, private
as $$
begin
  insert into public.accounts_payable_installments(account_id, installment_no, due_date, amount)
  values (new.id, 1, new.due_date, new.amount)
  on conflict (account_id, installment_no) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_accounts_payable_installment on public.accounts_payable;
create trigger trg_accounts_payable_installment
after insert on public.accounts_payable
for each row execute function private.create_payable_installment();

create or replace function private.create_payable_from_receipt()
returns trigger language plpgsql security definer set search_path = public, private
as $$
begin
  if new.status = 'posted' and (old.status is distinct from 'posted') and coalesce(new.total_cost,0) > 0 then
    insert into public.accounts_payable(
      tenant_id, supplier_id, store_id, goods_receipt_id, description,
      document_number, issue_date, due_date, amount, status, created_by
    )
    values (
      new.tenant_id, new.supplier_id, new.store_id, new.id,
      'Compra recebida — conferir vencimento',
      new.supplier_invoice_number, coalesce(new.received_at::date, current_date),
      coalesce(new.received_at::date, current_date),
      new.total_cost, 'draft', auth.uid()
    )
    on conflict (goods_receipt_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_create_payable_from_receipt on public.goods_receipts;
create trigger trg_create_payable_from_receipt
after update of status on public.goods_receipts
for each row execute function private.create_payable_from_receipt();

create or replace function public.approve_accounts_payable(_account_id uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare a public.accounts_payable%rowtype;
begin
  select * into a from public.accounts_payable where id = _account_id for update;
  if not found then raise exception 'Conta a pagar não encontrada'; end if;
  if not private.has_tenant_role(a.tenant_id, auth.uid(), array['owner','admin','manager']) then raise exception 'Sem permissão para aprovar esta conta'; end if;
  if a.status not in ('draft','pending') then raise exception 'Conta não está pendente de aprovação'; end if;
  update public.accounts_payable set status='approved', approved_by=auth.uid(), approved_at=now(), updated_at=now() where id=a.id;
  return jsonb_build_object('ok',true,'account_id',a.id,'status','approved');
end;
$$;

create or replace function public.pay_accounts_payable(_account_id uuid, _payment_method text default null, _paid_amount numeric default null)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare a public.accounts_payable%rowtype; v_amount numeric(14,2);
begin
  select * into a from public.accounts_payable where id = _account_id for update;
  if not found then raise exception 'Conta a pagar não encontrada'; end if;
  if not private.has_tenant_role(a.tenant_id, auth.uid(), array['owner','admin','manager']) then raise exception 'Sem permissão para baixar esta conta'; end if;
  if a.status not in ('approved','partially_paid') then raise exception 'A conta precisa estar aprovada para pagamento'; end if;
  v_amount := coalesce(_paid_amount, a.amount - a.paid_amount);
  if v_amount <= 0 or v_amount > a.amount - a.paid_amount then raise exception 'Valor de pagamento inválido'; end if;
  update public.accounts_payable
  set paid_amount = paid_amount + v_amount,
      status = case when paid_amount + v_amount >= amount then 'paid' else 'partially_paid' end,
      payment_method = coalesce(_payment_method, payment_method),
      paid_by = auth.uid(), paid_at = case when paid_amount + v_amount >= amount then now() else paid_at end,
      updated_at = now()
  where id = a.id;
  update public.accounts_payable_installments
  set paid_amount = least(amount, paid_amount + v_amount),
      status = case when paid_amount + v_amount >= amount then 'paid' else status end,
      paid_at = case when paid_amount + v_amount >= amount then now() else paid_at end
  where account_id = a.id and installment_no = 1;
  return jsonb_build_object('ok',true,'account_id',a.id);
end;
$$;

grant execute on function public.approve_accounts_payable(uuid) to authenticated;
grant execute on function public.pay_accounts_payable(uuid,text,numeric) to authenticated;
