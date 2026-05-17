
ALTER TABLE public.trier_settings
  ALTER COLUMN base_url SET DEFAULT 'https://api-sgf-gateway.triersistemas.com.br/sgfpod1';

ALTER TABLE public.trier_settings
  ADD COLUMN IF NOT EXISTS ecommerce_filter text NOT NULL DEFAULT '';

UPDATE public.trier_settings
SET
  base_url = 'https://api-sgf-gateway.triersistemas.com.br/sgfpod1',
  environment = CASE WHEN environment IN ('homologacao','producao') THEN 'gateway' ELSE environment END,
  branch_code = COALESCE(NULLIF(branch_code, ''), '1'),
  page_size = CASE WHEN page_size IN (50, 100) THEN 150 ELSE page_size END,
  ecommerce_filter = COALESCE(ecommerce_filter, '')
WHERE id = 1;
