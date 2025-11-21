SET check_function_bodies = OFF;

CREATE OR REPLACE FUNCTION public.get_user_emails()
  RETURNS TABLE(user_id uuid, email text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO public, auth
AS $$
DECLARE
  has_access boolean;
BEGIN
  has_access := public.has_permission('users.read'::public.app_permission);

  IF NOT has_access THEN
    RAISE EXCEPTION 'Insufficient permissions to view user emails';
  END IF;

  RETURN QUERY
    SELECT u.id::uuid AS user_id,
           u.email::text AS email
    FROM auth.users AS u;
END;
$$;

COMMENT ON FUNCTION public.get_user_emails()
  IS 'Returns auth user IDs and emails for privileged admin tooling.';

GRANT EXECUTE ON FUNCTION public.get_user_emails() TO authenticated;
