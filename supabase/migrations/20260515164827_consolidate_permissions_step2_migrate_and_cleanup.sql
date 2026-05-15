-- Consolidate granular network sub-resource permissions (containers.*, gameservers.*,
-- servers.*) into a single network.* permission group, and expenses.* into funding.*
-- (already the correct prefix for the funding concept).
--
-- Moderators lose all network and funding permissions - they do not need them.

-- Step 1: migrate role_permissions data
INSERT INTO public.role_permissions (role, permission)
SELECT 'admin', p
FROM unnest(ARRAY[
  'network.create'::public.app_permission,
  'network.read'::public.app_permission,
  'network.update'::public.app_permission,
  'network.delete'::public.app_permission
]) AS p
ON CONFLICT DO NOTHING;

DELETE FROM public.role_permissions
WHERE permission::text LIKE ANY(ARRAY[
  'containers.%', 'gameservers.%', 'servers.%', 'expenses.%'
]);

DELETE FROM public.role_permissions
WHERE role = 'moderator'
  AND permission::text LIKE 'funding.%';

-- Step 2: drop RLS policies on affected tables that reference old enum values
DROP POLICY IF EXISTS "Allow authorized roles to DELETE stale containers" ON public.network_containers;
DROP POLICY IF EXISTS "Allow authorized roles to INSERT gameservers" ON public.network_gameservers;
DROP POLICY IF EXISTS "Allow authorized roles to UPDATE gameservers" ON public.network_gameservers;
DROP POLICY IF EXISTS "Allow authorized roles to DELETE gameservers" ON public.network_gameservers;
DROP POLICY IF EXISTS "Allow authorized roles to INSERT servers" ON public.network_servers;
DROP POLICY IF EXISTS "Allow authorized roles to UPDATE servers" ON public.network_servers;
DROP POLICY IF EXISTS "Allow authorized roles to DELETE servers" ON public.network_servers;
DROP POLICY IF EXISTS "Allow authorized roles to INSERT expenses" ON public.funding_expenses;
DROP POLICY IF EXISTS "Allow authorized roles to UPDATE expenses" ON public.funding_expenses;
DROP POLICY IF EXISTS "Allow authorized roles to DELETE expenses" ON public.funding_expenses;

-- Step 3: cast permission column to text, swap enum type (drop stale values), cast back
-- Postgres does not support DROP VALUE on enums; the type must be recreated.
-- Casting the column to text first avoids the dependency chain on the old type.
ALTER TABLE public.role_permissions
  ALTER COLUMN permission TYPE text;

DO $$
DECLARE
  new_enum_values text[];
BEGIN
  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
  INTO new_enum_values
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'app_permission'
    AND e.enumlabel NOT LIKE 'containers.%'
    AND e.enumlabel NOT LIKE 'gameservers.%'
    AND e.enumlabel NOT LIKE 'servers.%'
    AND e.enumlabel NOT LIKE 'expenses.%';

  ALTER TYPE public.app_permission RENAME TO app_permission_old;

  EXECUTE (
    SELECT 'CREATE TYPE public.app_permission AS ENUM ('
      || string_agg(quote_literal(val), ', ' ORDER BY ord)
      || ')'
    FROM unnest(new_enum_values) WITH ORDINALITY AS t(val, ord)
  );

  DROP TYPE public.app_permission_old CASCADE;
END;
$$;

-- Step 4: restore column and dependent functions
ALTER TABLE public.role_permissions
  ALTER COLUMN permission TYPE public.app_permission
  USING permission::public.app_permission;

CREATE OR REPLACE FUNCTION public.authorize(requested_permission public.app_permission)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.app_role;
BEGIN
  IF NOT public.is_not_banned() THEN
    RETURN false;
  END IF;

  IF public.has_verified_mfa() AND (auth.jwt() ->> 'aal') <> 'aal2' THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.has_permission(permission_name public.app_permission)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $function$
  SELECT public.authorize(permission_name);
$function$;

-- Step 5: recreate RLS policies with new permission names

CREATE POLICY "Allow authorized roles to DELETE stale containers"
  ON public.network_containers AS permissive
  FOR DELETE TO authenticated
  USING (
    public.has_permission('network.delete'::public.app_permission)
    AND (reported_at <= (now() - '02:00:00'::interval))
  );

CREATE POLICY "Allow authorized roles to INSERT gameservers"
  ON public.network_gameservers AS permissive
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('network.create'::public.app_permission)
    AND (EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.agreed_content_rules = true
    ))
  );

CREATE POLICY "Allow authorized roles to UPDATE gameservers"
  ON public.network_gameservers AS permissive
  FOR UPDATE TO authenticated
  USING (
    public.has_permission('network.update'::public.app_permission)
    AND (EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.agreed_content_rules = true
    ))
  );

CREATE POLICY "Allow authorized roles to DELETE gameservers"
  ON public.network_gameservers AS permissive
  FOR DELETE TO authenticated
  USING (public.has_permission('network.delete'::public.app_permission));

CREATE POLICY "Allow authorized roles to INSERT servers"
  ON public.network_servers AS permissive
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('network.create'::public.app_permission));

CREATE POLICY "Allow authorized roles to UPDATE servers"
  ON public.network_servers AS permissive
  FOR UPDATE TO authenticated
  USING (public.has_permission('network.update'::public.app_permission))
  WITH CHECK (
    public.has_permission('network.update'::public.app_permission)
    AND public.audit_fields_unchanged(created_at, created_by)
  );

CREATE POLICY "Allow authorized roles to DELETE servers"
  ON public.network_servers AS permissive
  FOR DELETE TO authenticated
  USING (public.has_permission('network.delete'::public.app_permission));

CREATE POLICY "Allow authorized roles to INSERT expenses"
  ON public.funding_expenses AS permissive
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('funding.create'::public.app_permission));

CREATE POLICY "Allow authorized roles to UPDATE expenses"
  ON public.funding_expenses AS permissive
  FOR UPDATE TO authenticated
  USING (public.has_permission('funding.update'::public.app_permission))
  WITH CHECK (
    public.has_permission('funding.update'::public.app_permission)
    AND public.audit_fields_unchanged(created_at, created_by)
  );

CREATE POLICY "Allow authorized roles to DELETE expenses"
  ON public.funding_expenses AS permissive
  FOR DELETE TO authenticated
  USING (public.has_permission('funding.delete'::public.app_permission));
