create or replace function public.update_accounts_payable(
  _account_id uuid,
  _description text,
  _document_number text,
  _due_date date,
  _amount numeric,
  _supplier_id uuid default null,
  _cost_center text default null,
  _notes text default null
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare a public.accounts_payable%rowtype;
begin
  select * into a from public.accounts_payable where id = _account_id for update;
  if not found then raise exception 'Conta a pagar não encontrada'; end if;
  if not private.has_tenant_role(a.tenant_id, auth.uid(), array['owner','admin','manager']) then raise exception 'Sem permissão para editar esta conta'; end if;
  if a.status not in ('draft','pending') then raise exception 'Somente contas em rascunho ou pendentes podem ser editadas'; end if;
  if coalesce(trim(_description),'') = '' or _due_date is null or coalesce(_amount,0) <= 0 then raise exception 'Descrição, vencimento e valor são obrigatórios'; end if;
  update public.accounts_payable
  set description = trim(_description),
      document_number = nullif(trim(coalesce(_document_number,'')),''),
      due_date = _due_date,
      amount = _amount,
      supplier_id = _supplier_id,
      cost_center = nullif(trim(coalesce(_cost_center,'')),''),
      notes = nullif(trim(coalesce(_notes,'')),''),
      updated_at = now()
  where id = _account_id;
  delete from public.accounts_payable_installments where account_id = _account_id;
  insert into public.accounts_payable_installments(account_id, installment_no, due_date, amount)
  values (_account_id, 1, _due_date, _amount);
  return jsonb_build_object('ok',true,'account_id',_account_id);
end;
$$;

create or replace function public.set_accounts_payable_installments(
  _account_id uuid,
  _installment_count integer,
  _first_due_date date,
  _interval_days integer default 30
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare a public.accounts_payable%rowtype; i integer; v_amount numeric(14,2); v_sum numeric(14,2);
begin
  select * into a from public.accounts_payable where id = _account_id for update;
  if not found then raise exception 'Conta a pagar não encontrada'; end if;
  if not private.has_tenant_role(a.tenant_id, auth.uid(), array['owner','admin','manager']) then raise exception 'Sem permissão para configurar parcelas'; end if;
  if a.status not in ('draft','pending') then raise exception 'Somente contas em rascunho ou pendentes podem ser parceladas'; end if;
  if _installment_count is null or _installment_count < 1 or _installment_count > 36 then raise exception 'Informe entre 1 e 36 parcelas'; end if;
  if _first_due_date is null or _interval_days is null or _interval_days < 1 then raise exception 'Vencimento e intervalo inválidos'; end if;
  delete from public.accounts_payable_installments where account_id = _account_id;
  v_amount := round(a.amount / _installment_count, 2);
  v_sum := 0;
  for i in 1.._installment_count loop
    if i = _installment_count then v_amount := a.amount - v_sum; end if;
    insert into public.accounts_payable_installments(account_id, installment_no, due_date, amount)
    values (_account_id, i, _first_due_date + ((_interval_days * (i-1))::integer), v_amount);
    v_sum := v_sum + v_amount;
  end loop;
  update public.accounts_payable set due_date = _first_due_date, updated_at = now() where id = _account_id;
  return jsonb_build_object('ok',true,'account_id',_account_id,'installments',_installment_count);
end;
$$;

create or replace function public.cancel_accounts_payable(_account_id uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare a public.accounts_payable%rowtype;
begin
  select * into a from public.accounts_payable where id = _account_id for update;
  if not found then raise exception 'Conta a pagar não encontrada'; end if;
  if not private.has_tenant_role(a.tenant_id, auth.uid(), array['owner','admin','manager']) then raise exception 'Sem permissão para cancelar esta conta'; end if;
  if a.status in ('paid','partially_paid') then raise exception 'Conta já possui pagamento e não pode ser cancelada'; end if;
  update public.accounts_payable set status='cancelled', updated_at=now() where id=_account_id;
  update public.accounts_payable_installments set status='cancelled' where account_id=_account_id;
  return jsonb_build_object('ok',true,'account_id',_account_id,'status','cancelled');
end;
$$;

grant execute on function public.update_accounts_payable(uuid,text,text,date,numeric,uuid,text,text) to authenticated;
grant execute on function public.set_accounts_payable_installments(uuid,integer,date,integer) to authenticated;
grant execute on function public.cancel_accounts_payable(uuid) to authenticated;
