-- FIX: search_path vulnerability on all SECURITY DEFINER functions
-- Using DO block to skip functions that may not exist in this database

DO $do$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema, p.proname AS name, 
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND array_to_string(p.proconfig, ',') LIKE '%search_path=public%'
       OR array_to_string(p.proconfig, ',') LIKE '%search_path = public%'
       OR array_to_string(p.proconfig, ',') LIKE '%search_path=''public''%'
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = ''''',
      fn.schema, fn.name, fn.args
    );
    RAISE NOTICE 'Fixed: %.%(%)', fn.schema, fn.name, fn.args;
  END LOOP;
END
$do$;
