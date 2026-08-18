-- Pin the Trier seller used for e-commerce sales after a read-only API readiness check.
-- Only fills the value when it is still unset, preserving explicit future configuration.
UPDATE public.trier_settings
SET seller_code = 45
WHERE id = 1 AND seller_code IS NULL;
