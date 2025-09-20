-- Fix the authorize function to query the database directly instead of relying on JWT claims
-- This eliminates the complexity and unreliability of JWT claims for role-based access control
-- Update the authorize function to use database queries instead of JWT claims
CREATE OR REPLACE FUNCTION public.authorize(requested_permission app_permission)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
  bind_permissions int;
  user_role public.app_role;
  current_user_id uuid;
BEGIN
  -- Get the current user ID from auth.uid()
  current_user_id := auth.uid();
  -- If no user is authenticated, return false
  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  -- Fetch user role directly from the user_roles table
  SELECT
    ROLE INTO user_role
  FROM
    public.user_roles
  WHERE
    user_id = current_user_id
  LIMIT 1;
  -- If user has no role assigned, return false
  IF user_role IS NULL THEN
    RETURN FALSE;
  END IF;
  -- Check if the user's role has the requested permission
  SELECT
    COUNT(*) INTO bind_permissions
  FROM
    public.role_permissions
  WHERE
    role_permissions.permission = requested_permission
    AND role_permissions.role = user_role;
  RETURN bind_permissions > 0;
END;
$function$;

