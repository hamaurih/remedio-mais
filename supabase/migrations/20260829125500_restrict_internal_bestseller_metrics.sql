REVOKE EXECUTE ON FUNCTION public.public_bestsellers(integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_bestsellers(integer, integer) TO service_role;
COMMENT ON FUNCTION public.public_bestsellers(integer, integer) IS 'Internal aggregate sales metrics. Not exposed to anonymous/authenticated API clients; consumed by privileged diagnostics.';
