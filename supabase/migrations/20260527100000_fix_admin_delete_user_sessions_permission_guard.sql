-- Migration: fix_admin_delete_user_sessions_permission_guard
--
-- Converts admin_delete_user_sessions from LANGUAGE sql (no permission check)
-- to plpgsql with an explicit has_permission guard. Previously any authenticated
-- user with EXECUTE could force-sign-out any other user.

CREATE OR REPLACE FUNCTION public.admin_delete_user_sessions(target_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.has_permission('users.update'::public.app_permission) THEN
    RAISE EXCEPTION 'Insufficient permissions to delete user sessions';
  END IF;

  -- Sign the user out everywhere by removing active sessions (auth.sessions.user_id is uuid)
  DELETE FROM auth.sessions WHERE user_id = target_user;
  -- Remove refresh tokens (auth.refresh_tokens.user_id is text)
  DELETE FROM auth.refresh_tokens WHERE user_id = target_user::text;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_sessions(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user_sessions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_sessions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_sessions(uuid) TO service_role;
