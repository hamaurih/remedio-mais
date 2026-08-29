REVOKE EXECUTE ON FUNCTION public.admin_invite_seller(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_invite_seller(text) TO service_role;
COMMENT ON FUNCTION public.admin_invite_seller(text) IS 'Legacy seller email-invite RPC disabled for client roles. Do not re-enable; use the current controlled user provisioning flow.';
