-- Fix auth RLS init plan: wrap auth.* calls in (select ...) so they are
-- evaluated once per query instead of once per row.
-- Ref: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

CREATE OR REPLACE FUNCTION public.has_verified_mfa()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.mfa_factors
    WHERE user_id = (SELECT auth.uid())
      AND factor_type = 'totp'
      AND status = 'verified'
  );
$$;

CREATE OR REPLACE FUNCTION public.authorize(requested_permission app_permission)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF NOT public.is_not_banned() THEN
    RETURN false;
  END IF;

  IF public.has_verified_mfa() AND ((SELECT auth.jwt()) ->> 'aal') <> 'aal2' THEN
    RETURN false;
  END IF;

  v_role := public.current_user_role();

  RETURN EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    WHERE rp.role       = v_role
      AND rp.permission = requested_permission
  );
END;
$$;
