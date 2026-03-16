-- Cache user role in a session-local GUC so multiple RLS policies
-- on the same table (discussions, discussion_replies, etc.) only hit
-- user_roles once per transaction instead of once per policy.
--
-- The function stores the resolved role in a session-local GUC
-- ('app.user_role_cache'). Subsequent calls within the same transaction
-- skip the user_roles lookup entirely. The GUC is transaction-scoped
-- (set_config(..., true) = local), so it resets on commit/rollback and
-- will never bleed across connections in a pool.
--
-- Usage: replace bare `authorize(...)` checks that re-query user_roles
-- with `current_user_role()` in policies where the role alone is enough.
-- The authorize() function itself can also call current_user_role()
-- internally to eliminate its own repeated lookup.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. GUC cache function
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  cached text;
  role   public.app_role;
BEGIN
  -- Try reading from the session-local GUC first.
  -- current_setting() raises undefined_object if the GUC has never been set
  -- in this session, so we trap that and treat it as a cache miss.
  BEGIN
    cached := current_setting('app.user_role_cache');
    IF cached IS NOT NULL AND cached <> '' THEN
      RETURN cached::public.app_role;
    END IF;
  EXCEPTION WHEN undefined_object THEN
    NULL; -- cache miss, fall through to DB lookup
  END;

  -- Cache miss: resolve role from user_roles.
  SELECT ur.role
    INTO role
    FROM public.user_roles ur
   WHERE ur.user_id = (SELECT auth.uid())
   LIMIT 1;

  -- Store in a transaction-local GUC (last arg = true → LOCAL scope).
  -- COALESCE to empty string so a NULL result is still cached and avoids
  -- a repeated lookup for users with no role row.
  PERFORM set_config('app.user_role_cache', COALESCE(role::text, ''), true);

  RETURN role;
END;
$$;

COMMENT ON FUNCTION public.current_user_role() IS
  'Returns the app_role for the current authenticated user. '
  'The result is cached in a transaction-local GUC (app.user_role_cache) so '
  'multiple RLS policy evaluations within the same statement pay only one '
  'user_roles lookup. The cache is automatically invalidated on commit/rollback.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Update authorize() to use the cached role lookup internally
--    so all existing policies that call authorize() benefit automatically
--    without needing individual policy rewrites.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.authorize(requested_permission public.app_permission)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  -- Use the GUC-cached role instead of querying user_roles directly.
  v_role := public.current_user_role();

  RETURN EXISTS (
    SELECT 1
      FROM public.role_permissions rp
     WHERE rp.role       = v_role
       AND rp.permission = requested_permission
  );
END;
$$;

COMMENT ON FUNCTION public.authorize(public.app_permission) IS
  'Returns true if the current user''s role has the given permission. '
  'Role lookup is served from the GUC cache (current_user_role()) so '
  'multiple policy evaluations per statement share a single user_roles hit.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO service_role;

GRANT EXECUTE ON FUNCTION public.authorize(public.app_permission) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize(public.app_permission) TO service_role;
