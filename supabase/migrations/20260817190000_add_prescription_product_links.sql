-- Vincula uma única receita a todos os medicamentos correspondentes no carrinho.
alter table public.prescriptions
  add column if not exists product_ids uuid[] not null default '{}'::uuid[];

update public.prescriptions
set product_ids = array[product_id]
where product_id is not null
  and cardinality(product_ids) = 0;

create index if not exists idx_prescriptions_product_ids
  on public.prescriptions using gin (product_ids);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'prescriptions_product_ids_limit'
      and conrelid = 'public.prescriptions'::regclass
  ) then
    alter table public.prescriptions
      add constraint prescriptions_product_ids_limit
      check (cardinality(product_ids) <= 20);
  end if;
end
$$;

comment on column public.prescriptions.product_ids is
  'Produtos do carrinho cobertos pela mesma receita enviada pelo cliente.';
