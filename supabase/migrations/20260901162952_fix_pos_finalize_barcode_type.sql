do $$
declare
  def text;
begin
  select pg_get_functiondef('public.pos_finalize_sale(jsonb)'::regprocedure) into def;
  if position('coalesce(p.barcode, p.trier_barcode, p.manual_barcode)' in def) > 0 then
    def := replace(
      def,
      'coalesce(p.barcode, p.trier_barcode, p.manual_barcode)',
      'coalesce(p.barcode, p.trier_barcode)'
    );
    execute def;
  end if;
end $$;
