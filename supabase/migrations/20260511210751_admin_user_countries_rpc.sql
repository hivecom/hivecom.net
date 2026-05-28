CREATE OR REPLACE FUNCTION public.get_admin_user_countries()
RETURNS TABLE(country character varying)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  SELECT DISTINCT p.country
  FROM public.profiles AS p
  WHERE p.country IS NOT NULL
    AND p.country <> ''
    AND public.has_permission('users.read'::public.app_permission)
  ORDER BY p.country;
$function$;
