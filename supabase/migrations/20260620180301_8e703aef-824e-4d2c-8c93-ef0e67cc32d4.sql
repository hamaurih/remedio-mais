
REVOKE EXECUTE ON FUNCTION public.admin_invite_seller(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_seller(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_sellers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_invite_seller(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_seller(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_sellers() TO authenticated;
