-- Funções administrativas não devem nem sequer ser chamáveis por visitantes.
-- Já validam has_role() internamente, mas negar EXECUTE ao anon remove a
-- superfície de ataque e silencia o alerta do linter.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND (p.proname LIKE 'admin\_%' OR p.proname = 'admin_taxonomy_rows')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;