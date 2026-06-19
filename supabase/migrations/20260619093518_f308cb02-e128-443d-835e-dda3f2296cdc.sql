-- Fix: product_variants had no table-level GRANTs, so PostgREST denied access
-- to anon/authenticated even though the RLS policy "Anyone can view active variants" allowed it.
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;