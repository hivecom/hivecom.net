-- Fallback to user_roles when JWT claim missing
BEGIN;

CREATE OR REPLACE FUNCTION public.authorize(requested_permission public.app_permission)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  bind_permissions int;
  user_role public.app_role;
BEGIN
  -- Prefer JWT claim, fallback to user_roles table
  SELECT (auth.jwt() ->> 'user_role')::public.app_role INTO user_role;

  IF user_role IS NULL THEN
    SELECT role
      INTO user_role
    FROM public.user_roles
    WHERE user_id = auth.uid();
  END IF;

  SELECT COUNT(*) INTO bind_permissions
  FROM public.role_permissions
  WHERE role_permissions.permission = requested_permission
    AND role_permissions.role = user_role;

  RETURN bind_permissions > 0;
END;
$function$;

COMMIT;
