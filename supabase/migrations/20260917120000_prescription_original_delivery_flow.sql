-- Permite concluir a compra de receitas não controladas com a conferência da
-- receita original no recebimento. A receita digital continua recebida/analisada
-- (nunca é aprovada automaticamente) e a expedição fica bloqueada até validação.

alter table public.orders
  add column if not exists prescription_original_required boolean not null default false,
  add column if not exists prescription_original_status text not null default 'not_required',
  add column if not exists prescription_original_collected_at timestamptz,
  add column if not exists prescription_original_notes text;

alter table public.order_items
  add column if not exists prescription_id uuid references public.prescriptions(id),
  add column if not exists prescription_condition text not null default 'none';

create index if not exists orders_prescription_original_status_idx
  on public.orders(prescription_original_required, prescription_original_status)
  where prescription_original_required = true;

create index if not exists order_items_prescription_id_idx
  on public.order_items(prescription_id)
  where prescription_id is not null;

comment on column public.orders.prescription_original_required is
  'Pedido contém receita que deve ser conferida no recebimento/retirada.';
comment on column public.orders.prescription_original_status is
  'not_required, pending_collection, validated ou rejected.';
comment on column public.order_items.prescription_condition is
  'none, original_on_delivery ou manual_approval.';
