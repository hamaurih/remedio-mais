
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS store_lat numeric,
  ADD COLUMN IF NOT EXISTS store_lng numeric,
  ADD COLUMN IF NOT EXISTS store_geocoded_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_max_km numeric NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'distance',
  ADD COLUMN IF NOT EXISTS delivery_fee_zones jsonb NOT NULL DEFAULT '[
    {"min_km": 0,  "max_km": 3,  "fee": 5.00,  "label": "Até 3 km"},
    {"min_km": 3,  "max_km": 6,  "fee": 8.00,  "label": "3 a 6 km"},
    {"min_km": 6,  "max_km": 10, "fee": 12.00, "label": "6 a 10 km"},
    {"min_km": 10, "max_km": 14, "fee": 18.00, "label": "10 a 14 km"},
    {"min_km": 14, "max_km": 18, "fee": 24.00, "label": "14 a 18 km"}
  ]'::jsonb;

UPDATE public.store_settings
SET store_lat = -7.236629,
    store_lng = -35.922702,
    store_geocoded_at = now()
WHERE id = 1 AND store_lat IS NULL;

ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric,
  ADD COLUMN IF NOT EXISTS place_id text;
