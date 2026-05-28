-- Migration: fix_get_admin_user_countries_harden_permission_gate
--
-- get_admin_user_countries used LANGUAGE sql with has_permission() in the
-- WHERE clause - returns 0 rows silently on unauthorized access instead of
-- raising an error. Converts to plpgsql with an explicit RAISE EXCEPTION
-- so callers get a clear error rather than a misleading empty result set.

CREATE OR REPLACE FUNCTION public.get_admin_user_countries()
RETURNS TABLE(country character varying)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.has_permission('users.read'::public.app_permission) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN QUERY
    SELECT DISTINCT p.country
    FROM public.profiles AS p
    WHERE p.country IS NOT NULL
      AND p.country <> ''
    ORDER BY p.country;
END;
$function$;
