create index if not exists idx_pos_delivery_quotes_consumed_sale
  on public.pos_delivery_quotes(consumed_by_sale_id)
  where consumed_by_sale_id is not null;

create index if not exists idx_pos_sales_delivery_quote
  on public.pos_sales(delivery_quote_id)
  where delivery_quote_id is not null;
