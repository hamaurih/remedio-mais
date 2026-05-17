UPDATE public.trier_settings
SET base_url = 'https://homologacao.triersistemas.com.br/sgfpod1'
WHERE id = 1
  AND (base_url ILIKE '%/rest/%'
       OR base_url ILIKE '%api-sgf-gateway%'
       OR base_url ILIKE '%api-sgf%');