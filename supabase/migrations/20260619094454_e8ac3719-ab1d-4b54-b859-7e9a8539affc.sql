-- Restore table-level SELECT on products to anon/authenticated.
-- The previous column-level restriction broke `select("*")` queries used across the storefront.
GRANT SELECT ON public.products TO anon, authenticated;