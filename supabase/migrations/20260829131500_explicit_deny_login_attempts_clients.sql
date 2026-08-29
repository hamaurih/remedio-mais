CREATE POLICY "auth_login_attempts_client_deny"
ON public.auth_login_attempts
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
