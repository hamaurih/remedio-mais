-- Batch apply stock changes returned by Trier.
-- Manual stock locks are preserved; availability trigger handles active state.
create or replace function public.apply_trier_stock_delta(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_input integer := 0;
  v_updated integer := 0;
  v_positive integer := 0;
  v_zero integer := 0;
begin
  if _payload is null or jsonb_typeof(_payload)<>'array' then
    raise exception 'Stock delta payload must be an array';
  end if;
  select jsonb_array_length(_payload) into v_input;

  with incoming as (
    select distinct on (x.trier_id)
      x.trier_id,
      greatest(0,x.stock)::integer as stock
    from (
      select
        nullif(btrim(coalesce(v->>'codigoProduto',v->>'codigo',v->>'idProduto')),'') as trier_id,
        coalesce(nullif(coalesce(v->>'quantidadeEstoque',v->>'estoque',v->>'saldoEstoque'),'')::numeric,0) as stock
      from jsonb_array_elements(_payload) v
    ) x
    where x.trier_id is not null
    order by x.trier_id
  ), changed as (
    update public.products p
    set stock=i.stock,
        stock_quantity=i.stock,
        trier_stock_quantity=i.stock,
        last_stock_sync_at=now(),
        last_trier_sync_at=now(),
        stock_origin='trier',
        source='trier'
    from incoming i
    where p.trier_product_id=i.trier_id
      and coalesce(p.lock_manual_stock,false)=false
    returning i.stock
  )
  select count(*),count(*) filter(where stock>0),count(*) filter(where stock<=0)
  into v_updated,v_positive,v_zero
  from changed;

  return jsonb_build_object(
    'input_count',v_input,
    'updated_count',v_updated,
    'positive_count',v_positive,
    'zero_count',v_zero
  );
end;
$function$;

revoke all on function public.apply_trier_stock_delta(jsonb) from public,anon,authenticated;
grant execute on function public.apply_trier_stock_delta(jsonb) to service_role;
