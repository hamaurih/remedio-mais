-- Trier medicine-list codes (A1, C1, T, etc.) are regulatory signals.
-- Any non-empty list must be treated as prescription-required/controlled in the storefront.
update public.products
set requires_prescription = true,
    controlled = true,
    updated_at = now()
where nullif(trim(coalesce(medicine_list_type, '')), '') is not null
  and (
    coalesce(requires_prescription, false) = false
    or coalesce(controlled, false) = false
  );

-- Some products can carry an explicit sale observation requiring a prescription
-- even when no list code is present. Those must at least require prescription.
update public.products
set requires_prescription = true,
    updated_at = now()
where upper(coalesce(sale_observation, '')) like '%RECEITA%'
  and coalesce(requires_prescription, false) = false;
