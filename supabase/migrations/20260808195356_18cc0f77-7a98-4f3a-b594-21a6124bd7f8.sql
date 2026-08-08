-- Revoga leitura anônima de colunas puramente internas de products.
-- Estratégia: revoga SELECT amplo do anon e concede coluna a coluna,
-- exceto as internas listadas abaixo.
DO $$
DECLARE
  cols text;
  internal text[] := ARRAY[
    'archive_reason','archived_at','archived_by',
    'lock_base_price','lock_channel_discount','lock_manual_price',
    'lock_manual_stock','lock_promotion',
    'price_origin','channel_price_notes',
    'whatsapp_price','whatsapp_promo_price','whatsapp_discount_percentage'
  ];
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'products'
     AND NOT (column_name = ANY(internal));

  REVOKE SELECT ON public.products FROM anon;
  EXECUTE format('GRANT SELECT (%s) ON public.products TO anon', cols);
END $$;

-- Equipe/clientes logados seguem com acesso completo (RLS ainda filtra active = true).
GRANT SELECT ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;