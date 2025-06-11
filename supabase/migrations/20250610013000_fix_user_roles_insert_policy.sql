-- Fix user_roles INSERT policy to allow role assignment updates with roles.update permission
-- The current policy requires roles.create, but for user role assignments (not creating new role types),
-- we should allow INSERTs with roles.update permission since the application logic does DELETE+INSERT for updates
DO $$
BEGIN
  -- Drop the existing INSERT policy
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Allow authorized roles to INSERT user roles') THEN
  DROP POLICY "Allow authorized roles to INSERT user roles" ON "public"."user_roles";
END IF;
  -- Create new INSERT policy that allows both roles.create and roles.update permissions
  -- This allows both creating new role assignments and updating existing ones via DELETE+INSERT pattern
  -- but prevents privilege escalation by disallowing self-role assignment
  CREATE POLICY "Allow authorized roles to INSERT user roles" ON "public"."user_roles" AS permissive
    FOR INSERT TO authenticated
      WITH CHECK((public.has_permission('roles.create'::public.app_permission ) OR public.has_permission('roles.update'::public.app_permission ) )
      AND auth.uid( ) != user_id -- Prevent users from changing their own roles
 );
END
$$;

