ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_sales_channel_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_sales_channel_check
  CHECK (sales_channel = ANY (ARRAY['site'::text, 'whatsapp'::text, 'balcao'::text, 'telefone'::text, 'pdv'::text]));