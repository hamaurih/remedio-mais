-- Mantém approved_at consistente com o status da receita.
-- A regra fica no banco para cobrir painel admin, RPCs e futuras integrações.
create or replace function public.sync_prescription_approved_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'aprovada' then
    if tg_op = 'INSERT' or old.status is distinct from 'aprovada' then
      new.approved_at := coalesce(new.approved_at, now());
    end if;
  elsif tg_op = 'INSERT' or old.status is distinct from new.status then
    new.approved_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prescriptions_sync_approved_at on public.prescriptions;

create trigger trg_prescriptions_sync_approved_at
before insert or update of status on public.prescriptions
for each row
execute function public.sync_prescription_approved_at();

-- Corrige registros legados já aprovados sem timestamp.
update public.prescriptions
set approved_at = coalesce(approved_at, updated_at, created_at, now())
where status = 'aprovada'
  and approved_at is null;

comment on function public.sync_prescription_approved_at() is
  'Mantém prescriptions.approved_at sincronizado com transições do status aprovada.';
