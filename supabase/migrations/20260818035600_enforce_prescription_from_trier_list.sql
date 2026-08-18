-- Safety net for products imported from Trier.
-- Trier's `tipoLista` identifies controlled-list products (e.g. A1, B2, C1, T).
-- Any non-empty medicine_list_type must require prescription validation.
-- A sale observation mentioning a retained/prescription requirement also requires prescription.

create or replace function public.enforce_product_prescription_flags()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
declare
  list_code text := upper(btrim(coalesce(new.medicine_list_type, '')));
  sale_note text := upper(coalesce(new.sale_observation, ''));
begin
  if list_code <> '' then
    new.controlled := true;
    new.requires_prescription := true;
  elsif sale_note like '%RECEITA%' then
    new.requires_prescription := true;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enforce_product_prescription_flags on public.products;
create trigger trg_enforce_product_prescription_flags
before insert or update of medicine_list_type, sale_observation, controlled, requires_prescription
on public.products
for each row
execute function public.enforce_product_prescription_flags();

-- Reconcile existing rows idempotently.
update public.products
set controlled = case
      when nullif(btrim(coalesce(medicine_list_type,'')), '') is not null then true
      else controlled
    end,
    requires_prescription = case
      when nullif(btrim(coalesce(medicine_list_type,'')), '') is not null then true
      when upper(coalesce(sale_observation,'')) like '%RECEITA%' then true
      else requires_prescription
    end
where
  (nullif(btrim(coalesce(medicine_list_type,'')), '') is not null and (controlled is distinct from true or requires_prescription is distinct from true))
  or (upper(coalesce(sale_observation,'')) like '%RECEITA%' and requires_prescription is distinct from true);

revoke all on function public.enforce_product_prescription_flags() from public, anon, authenticated;
