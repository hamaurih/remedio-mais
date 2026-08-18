-- Controlled staging/bootstrap importer for Trier product pages.
-- It is CREATE-ONLY by design: existing products are never overwritten.
-- Callable only by service_role (Edge Function/backend), never by browser roles.

create or replace function public.bootstrap_ingest_trier_products(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_input_count integer := 0;
  v_linked_count integer := 0;
begin
  if _payload is null or jsonb_typeof(_payload) <> 'array' then
    raise exception 'Trier payload must be a JSON array';
  end if;

  select jsonb_array_length(_payload) into v_input_count;

  with src as (
    select value as p
    from jsonb_array_elements(_payload)
  ), cats as (
    select distinct
      coalesce(nullif(btrim(p->>'nomeCategoria'),''),'Medicamentos') as name,
      lower(trim(both '-' from regexp_replace(
        translate(coalesce(nullif(btrim(p->>'nomeCategoria'),''),'Medicamentos'),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
          'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'),
        '[^A-Za-z0-9]+','-','g'))) as slug
    from src
  )
  insert into public.categories(name,slug,active,show_in_menu,show_on_home)
  select name,slug,true,true,true
  from cats
  where slug<>''
  on conflict (slug) do nothing;

  with src as (
    select value as p
    from jsonb_array_elements(_payload)
  ), norm as (
    select
      p,
      p->>'codigo' as trier_id,
      btrim(p->>'nome') as product_name,
      lower(trim(both '-' from regexp_replace(
        translate(btrim(p->>'nome'),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
          'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'),
        '[^A-Za-z0-9]+','-','g'))) || '-' || (p->>'codigo') as product_slug,
      lower(trim(both '-' from regexp_replace(
        translate(coalesce(nullif(btrim(p->>'nomeCategoria'),''),'Medicamentos'),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
          'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'),
        '[^A-Za-z0-9]+','-','g'))) as category_slug
    from src
  ), inserted as (
    insert into public.products(
      trier_product_id, sku, name, ecommerce_name, slug, category_id, description,
      barcode, trier_barcode, laboratory, laboratory_code, manufacturer,
      group_code, group_name, category_external_id, category_name,
      department_external_id, department_name, active_ingredient, active_ingredient_code,
      price, ecommerce_price, stock, stock_quantity, trier_stock_quantity, ecommerce_stock_quantity,
      is_active, trier_active, ecommerce_enabled, active,
      max_discount_percentage, sale_observation, medicine_list_type,
      requires_prescription, controlled, tags, cart_quantity_limit,
      source, last_trier_sync_at, last_stock_sync_at, price_origin, stock_origin, mapping_status
    )
    select
      n.trier_id,
      n.trier_id,
      n.product_name,
      nullif(btrim(n.p->>'nomeEcommerce'),''),
      n.product_slug,
      c.id,
      coalesce(nullif(btrim(n.p->>'descricaoEcommerce'),''), nullif(btrim(n.p->>'descricao'),'')),
      nullif(btrim(n.p->>'codigoBarras'),''),
      nullif(btrim(n.p->>'codigoBarras'),''),
      nullif(btrim(n.p->>'nomeLaboratorio'),''),
      nullif(btrim(n.p->>'codigoLaboratorio'),''),
      nullif(btrim(n.p->>'nomeLaboratorio'),''),
      nullif(btrim(n.p->>'codigoGrupo'),''),
      nullif(btrim(n.p->>'nomeGrupo'),''),
      nullif(btrim(n.p->>'codigoCategoria'),''),
      nullif(btrim(n.p->>'nomeCategoria'),''),
      nullif(btrim(n.p->>'codigoDepartamento'),''),
      nullif(btrim(n.p->>'nomeDepartamento'),''),
      nullif(btrim(n.p->>'nomePrincipioAtivo'),''),
      nullif(btrim(n.p->>'codigoPrincipioAtivo'),''),
      coalesce(nullif(n.p->>'valorVenda','')::numeric,0),
      nullif(n.p->>'valorVendaEcommerce','')::numeric,
      coalesce(nullif(n.p->>'quantidadeEstoque','')::integer,0),
      coalesce(nullif(n.p->>'quantidadeEstoque','')::integer,0),
      nullif(n.p->>'quantidadeEstoque','')::integer,
      nullif(n.p->>'quantidadeEstoqueEcommerce','')::integer,
      coalesce((n.p->>'ativo')::boolean,true),
      coalesce((n.p->>'ativo')::boolean,true),
      coalesce((n.p->>'integracaoEcommerce')::boolean,false),
      coalesce(nullif(n.p->>'quantidadeEstoque','')::integer,0)>0,
      nullif(n.p->>'percentualDescontoMax','')::numeric,
      nullif(btrim(n.p->>'observacaoVenda'),''),
      nullif(btrim(n.p->>'tipoLista'),''),
      false,
      false,
      case when jsonb_typeof(n.p->'tags')='array'
        then (select string_agg(x,',') from jsonb_array_elements_text(n.p->'tags') x)
        else null end,
      nullif(n.p->>'qtdLimiteCarrinhoEcommerce','')::integer,
      'trier', now(), now(), 'trier', 'trier', 'mapped'
    from norm n
    left join public.categories c on c.slug=n.category_slug
    where n.trier_id is not null and n.trier_id<>''
      and n.product_name is not null and n.product_name<>''
    on conflict (trier_product_id) do nothing
    returning id,trier_product_id,name,barcode
  )
  insert into public.trier_product_mappings(
    product_id,trier_product_id,trier_barcode,trier_name,last_synced_at,sync_status
  )
  select id,trier_product_id,barcode,name,now(),'ok'
  from inserted
  on conflict (trier_product_id) do update set
    product_id=excluded.product_id,
    trier_barcode=excluded.trier_barcode,
    trier_name=excluded.trier_name,
    last_synced_at=excluded.last_synced_at,
    sync_status='ok';

  select count(*)
    into v_linked_count
  from public.products p
  where p.trier_product_id in (
    select value->>'codigo' from jsonb_array_elements(_payload)
  );

  return jsonb_build_object(
    'input_count', v_input_count,
    'linked_count', v_linked_count,
    'mode', 'create_only'
  );
end;
$function$;

revoke all on function public.bootstrap_ingest_trier_products(jsonb) from public, anon, authenticated;
grant execute on function public.bootstrap_ingest_trier_products(jsonb) to service_role;
