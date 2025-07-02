-- Add new permissions to the app_permission enum for roles and complaints
-- Rename the existing enum type
ALTER TYPE "public"."app_permission" RENAME TO "app_permission__old_version_to_be_dropped";

-- Create the new enum type with additional permissions
CREATE TYPE "public"."app_permission" AS ENUM(
  'announcements.create',
  'announcements.delete',
  'announcements.read',
  'announcements.update',
  'complaints.create',
  'complaints.delete',
  'complaints.read',
  'complaints.update',
  'containers.create',
  'containers.delete',
  'containers.read',
  'containers.update',
  'events.create',
  'events.delete',
  'events.read',
  'events.update',
  'expenses.create',
  'expenses.delete',
  'expenses.read',
  'expenses.update',
  'forums.create',
  'forums.delete',
  'forums.read',
  'forums.update',
  'funding.create',
  'funding.delete',
  'funding.read',
  'funding.update',
  'games.create',
  'games.delete',
  'games.read',
  'games.update',
  'gameservers.create',
  'gameservers.delete',
  'gameservers.read',
  'gameservers.update',
  'profiles.delete',
  'profiles.read',
  'profiles.update',
  'projects.create',
  'projects.read',
  'projects.update',
  'projects.delete',
  'referendums.create',
  'referendums.delete',
  'referendums.read',
  'referendums.update',
  'roles.create',
  'roles.delete',
  'roles.read',
  'roles.update',
  'servers.create',
  'servers.delete',
  'servers.read',
  'servers.update',
  'users.create',
  'users.delete',
  'users.read',
  'users.update'
);

-- Update the table to use the new enum type
ALTER TABLE "public"."role_permissions"
  ALTER COLUMN permission TYPE "public"."app_permission"
  USING permission::text::"public"."app_permission";

-- Set check_function_bodies to OFF for function creation
SET check_function_bodies = OFF;

-- Update the authorize function to use the new enum type
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
BEGIN
  -- Fetch user role once and store it to reduce number of calls
  SELECT
    (auth.jwt() ->> 'user_role')::public.app_role INTO user_role;
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

-- Create helper functions for common policy patterns
-- Helper function to check if current user owns a record by user_id
CREATE OR REPLACE FUNCTION public.is_owner(record_user_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  SELECT
    auth.uid() = record_user_id;
$function$;

-- Helper function to check if current user owns a profile by profile id
CREATE OR REPLACE FUNCTION public.is_profile_owner(profile_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  SELECT
    auth.uid() = profile_id;
$function$;

-- Helper function wrapper for authorization checks
CREATE OR REPLACE FUNCTION public.has_permission(permission_name app_permission)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  SELECT
    public.authorize(permission_name);
$function$;

-- Helper function to check if audit fields remain unchanged
CREATE OR REPLACE FUNCTION public.audit_fields_unchanged(created_at timestamptz, created_by uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  SELECT
(NOT(created_at IS DISTINCT FROM created_at))
    AND(NOT(created_by IS DISTINCT FROM created_by));
$function$;

-- Update all existing policies to use the new enum type
-- Update policies for events table
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'events'
      AND policyname = 'Allow authorized roles to INSERT events') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to INSERT events" ON "public"."events";
  CREATE POLICY "Allow authorized roles to INSERT events" ON "public"."events" AS permissive
    FOR INSERT TO authenticated
      WITH CHECK(public.has_permission('events.create'::public.app_permission ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'events'
      AND policyname = 'Allow authorized roles to UPDATE events') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to UPDATE events" ON "public"."events";
  CREATE POLICY "Allow authorized roles to UPDATE events" ON "public"."events" AS permissive
    FOR UPDATE TO authenticated
      USING(public.has_permission('events.update'::public.app_permission ) )
      WITH CHECK(public.has_permission('events.update'::public.app_permission )
        AND public.audit_fields_unchanged(created_at, created_by ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'events'
      AND policyname = 'Allow authorized roles to DELETE events') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to DELETE events" ON "public"."events";
  CREATE POLICY "Allow authorized roles to DELETE events" ON "public"."events" AS permissive
    FOR DELETE TO authenticated
      USING(public.has_permission('events.delete'::public.app_permission ) );
END IF;
END
$$;

-- Update policies for games table
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'games'
      AND policyname = 'Allow authorized roles to INSERT games') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to INSERT games" ON "public"."games";
  CREATE POLICY "Allow authorized roles to INSERT games" ON "public"."games" AS permissive
    FOR INSERT TO authenticated
      WITH CHECK(public.has_permission('games.create'::public.app_permission ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'games'
      AND policyname = 'Allow authorized roles to UPDATE games') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to UPDATE games" ON "public"."games";
  CREATE POLICY "Allow authorized roles to UPDATE games" ON "public"."games" AS permissive
    FOR UPDATE TO authenticated
      USING(public.has_permission('games.update'::public.app_permission ) )
      WITH CHECK(public.has_permission('games.update'::public.app_permission )
        AND public.audit_fields_unchanged(created_at, created_by ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'games'
      AND policyname = 'Allow authorized roles to DELETE games') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to DELETE games" ON "public"."games";
  CREATE POLICY "Allow authorized roles to DELETE games" ON "public"."games" AS permissive
    FOR DELETE TO authenticated
      USING(public.has_permission('games.delete'::public.app_permission ) );
END IF;
END
$$;

-- Update policies for gameservers table
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'gameservers'
      AND policyname = 'Allow authorized roles to INSERT gameservers') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to INSERT gameservers" ON "public"."gameservers";
  CREATE POLICY "Allow authorized roles to INSERT gameservers" ON "public"."gameservers" AS permissive
    FOR INSERT TO authenticated
      WITH CHECK(public.has_permission('gameservers.create'::public.app_permission ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'gameservers'
      AND policyname = 'Allow authorized roles to UPDATE gameservers') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to UPDATE gameservers" ON "public"."gameservers";
  CREATE POLICY "Allow authorized roles to UPDATE gameservers" ON "public"."gameservers" AS permissive
    FOR UPDATE TO authenticated
      USING(public.has_permission('gameservers.update'::public.app_permission ) )
      WITH CHECK(public.has_permission('gameservers.update'::public.app_permission )
        AND public.audit_fields_unchanged(created_at, created_by ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'gameservers'
      AND policyname = 'Allow authorized roles to DELETE gameservers') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to DELETE gameservers" ON "public"."gameservers";
  CREATE POLICY "Allow authorized roles to DELETE gameservers" ON "public"."gameservers" AS permissive
    FOR DELETE TO authenticated
      USING(public.has_permission('gameservers.delete'::public.app_permission ) );
END IF;
END
$$;

-- Update policies for profiles table
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Allow authorized roles to UPDATE profiles') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to UPDATE profiles" ON "public"."profiles";
  CREATE POLICY "Allow authorized roles to UPDATE profiles" ON "public"."profiles" AS permissive
    FOR UPDATE TO authenticated
      USING(public.has_permission('profiles.update'::public.app_permission )
        OR public.is_profile_owner(id ) )
        WITH CHECK(public.has_permission('profiles.update'::public.app_permission )
        OR public.is_profile_owner(id ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Allow authorized roles to DELETE profiles') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to DELETE profiles" ON "public"."profiles";
  CREATE POLICY "Allow authorized roles to DELETE profiles" ON "public"."profiles" AS permissive
    FOR DELETE TO authenticated
      USING(public.has_permission('profiles.delete'::public.app_permission ) );
END IF;
END
$$;

-- Add SELECT policy for profiles table
DO $$
BEGIN
  CREATE POLICY "Allow users to SELECT profiles" ON "public"."profiles" AS permissive
    FOR SELECT TO authenticated
      USING(public.has_permission('profiles.read'::public.app_permission )
        OR public.has_permission('users.read'::public.app_permission )
        OR public.is_profile_owner(id )
        OR TRUE );
END
$$;

-- Update policies for referendums table
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'referendums'
      AND policyname = 'Allow authorized roles to INSERT referendums') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to INSERT referendums" ON "public"."referendums";
  CREATE POLICY "Allow authorized roles to INSERT referendums" ON "public"."referendums" AS permissive
    FOR INSERT TO authenticated
      WITH CHECK(public.has_permission('referendums.create'::public.app_permission ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'referendums'
      AND policyname = 'Allow authorized roles to UPDATE referendums') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to UPDATE referendums" ON "public"."referendums";
  CREATE POLICY "Allow authorized roles to UPDATE referendums" ON "public"."referendums" AS permissive
    FOR UPDATE TO authenticated
      USING(public.has_permission('referendums.update'::public.app_permission ) )
      WITH CHECK(public.has_permission('referendums.update'::public.app_permission )
        AND public.audit_fields_unchanged(created_at, created_by ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'referendums'
      AND policyname = 'Allow authorized roles to DELETE referendums') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to DELETE referendums" ON "public"."referendums";
  CREATE POLICY "Allow authorized roles to DELETE referendums" ON "public"."referendums" AS permissive
    FOR DELETE TO authenticated
      USING(public.has_permission('referendums.delete'::public.app_permission ) );
END IF;
END
$$;

-- Update policies for referendum_votes table
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'referendum_votes'
      AND policyname = 'Authorized users can INSERT votes') THEN
  DROP POLICY IF EXISTS "Authorized users can INSERT votes" ON "public"."referendum_votes";
  CREATE POLICY "Authorized users can INSERT votes" ON "public"."referendum_votes" AS permissive
    FOR INSERT TO authenticated
      WITH CHECK(public.has_permission('referendums.create'::public.app_permission ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'referendum_votes'
      AND policyname = 'Authorized users can UPDATE votes') THEN
  DROP POLICY IF EXISTS "Authorized users can UPDATE votes" ON "public"."referendum_votes";
  CREATE POLICY "Authorized users can UPDATE votes" ON "public"."referendum_votes" AS permissive
    FOR UPDATE TO authenticated
      USING(public.has_permission('referendums.update'::public.app_permission )
        OR public.is_owner(user_id ) )
        WITH CHECK(public.has_permission('referendums.update'::public.app_permission )
        OR public.is_owner(user_id ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'referendum_votes'
      AND policyname = 'Authorized users can DELETE votes') THEN
  DROP POLICY IF EXISTS "Authorized users can DELETE votes" ON "public"."referendum_votes";
  CREATE POLICY "Authorized users can DELETE votes" ON "public"."referendum_votes" AS permissive
    FOR DELETE TO authenticated
      USING(public.has_permission('referendums.delete'::public.app_permission )
        OR public.is_owner(user_id ) );
END IF;
END
$$;

-- Update policies for expenses table
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'expenses'
      AND policyname = 'Allow authorized roles to INSERT expenses') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to INSERT expenses" ON "public"."expenses";
  CREATE POLICY "Allow authorized roles to INSERT expenses" ON "public"."expenses" AS permissive
    FOR INSERT TO authenticated
      WITH CHECK(public.has_permission('expenses.create'::public.app_permission ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'expenses'
      AND policyname = 'Allow authorized roles to UPDATE expenses') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to UPDATE expenses" ON "public"."expenses";
  CREATE POLICY "Allow authorized roles to UPDATE expenses" ON "public"."expenses" AS permissive
    FOR UPDATE TO authenticated
      USING(public.has_permission('expenses.update'::public.app_permission ) )
      WITH CHECK(public.has_permission('expenses.update'::public.app_permission )
        AND public.audit_fields_unchanged(created_at, created_by ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'expenses'
      AND policyname = 'Allow authorized roles to DELETE expenses') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to DELETE expenses" ON "public"."expenses";
  CREATE POLICY "Allow authorized roles to DELETE expenses" ON "public"."expenses" AS permissive
    FOR DELETE TO authenticated
      USING(public.has_permission('expenses.delete'::public.app_permission ) );
END IF;
END
$$;

-- Update policies for servers table
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'servers'
      AND policyname = 'Allow authorized roles to INSERT servers') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to INSERT servers" ON "public"."servers";
  CREATE POLICY "Allow authorized roles to INSERT servers" ON "public"."servers" AS permissive
    FOR INSERT TO authenticated
      WITH CHECK(public.has_permission('servers.create'::public.app_permission ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'servers'
      AND policyname = 'Allow authorized roles to UPDATE servers') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to UPDATE servers" ON "public"."servers";
  CREATE POLICY "Allow authorized roles to UPDATE servers" ON "public"."servers" AS permissive
    FOR UPDATE TO authenticated
      USING(public.has_permission('servers.update'::public.app_permission ) )
      WITH CHECK(public.has_permission('servers.update'::public.app_permission )
        AND public.audit_fields_unchanged(created_at, created_by ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'servers'
      AND policyname = 'Allow authorized roles to DELETE servers') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to DELETE servers" ON "public"."servers";
  CREATE POLICY "Allow authorized roles to DELETE servers" ON "public"."servers" AS permissive
    FOR DELETE TO authenticated
      USING(public.has_permission('servers.delete'::public.app_permission ) );
END IF;
END
$$;

-- Update policies for storage.objects table
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow authorized roles to INSERT games in storage') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to INSERT games in storage" ON "storage"."objects";
  CREATE POLICY "Allow authorized roles to INSERT games in storage" ON "storage"."objects"
    FOR INSERT
      WITH CHECK(public.has_permission('games.create'::public.app_permission ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow authorized roles to UPDATE games in storage') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to UPDATE games in storage" ON "storage"."objects";
  CREATE POLICY "Allow authorized roles to UPDATE games in storage" ON "storage"."objects"
    FOR UPDATE
      USING(public.has_permission('games.update'::public.app_permission ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow authorized roles to DELETE games in storage') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to DELETE games in storage" ON "storage"."objects";
  CREATE POLICY "Allow authorized roles to DELETE games in storage" ON "storage"."objects"
    FOR DELETE
      USING(public.has_permission('games.delete'::public.app_permission ) );
END IF;
END
$$;

-- Update policies for containers table
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'containers'
      AND policyname = 'Allow authorized roles to DELETE stale containers') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to DELETE stale containers" ON "public"."containers";
  CREATE POLICY "Allow authorized roles to DELETE stale containers" ON "public"."containers" AS permissive
    FOR DELETE TO authenticated
      USING((public.has_permission('containers.delete'::public.app_permission ) AND(NOT running ) AND(reported_at <=(NOW( ) - '02:00:00'::interval ) ) ) );
END IF;
END
$$;

-- Update policies for announcements table
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'announcements'
      AND policyname = 'Allow authorized roles to INSERT announcements') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to INSERT announcements" ON "public"."announcements";
  CREATE POLICY "Allow authorized roles to INSERT announcements" ON "public"."announcements" AS permissive
    FOR INSERT TO authenticated
      WITH CHECK(public.has_permission('announcements.create'::public.app_permission ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'announcements'
      AND policyname = 'Allow authorized roles to UPDATE announcements') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to UPDATE announcements" ON "public"."announcements";
  CREATE POLICY "Allow authorized roles to UPDATE announcements" ON "public"."announcements" AS permissive
    FOR UPDATE TO authenticated
      USING(public.has_permission('announcements.update'::public.app_permission ) )
      WITH CHECK(public.has_permission('announcements.update'::public.app_permission )
        AND public.audit_fields_unchanged(created_at, created_by ) );
END IF;
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'announcements'
      AND policyname = 'Allow authorized roles to DELETE announcements') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to DELETE announcements" ON "public"."announcements";
  CREATE POLICY "Allow authorized roles to DELETE announcements" ON "public"."announcements" AS permissive
    FOR DELETE TO authenticated
      USING(public.has_permission('announcements.delete'::public.app_permission ) );
END IF;
END
$$;

-- Update policies for user_roles table to use roles permissions instead of users permissions
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Allow authorized roles to INSERT user roles') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to INSERT user roles" ON "public"."user_roles";
  CREATE POLICY "Allow authorized roles to INSERT user roles" ON "public"."user_roles" AS permissive
    FOR INSERT TO authenticated
      WITH CHECK(public.has_permission('roles.create'::public.app_permission ) );
END IF;
END
$$;

-- Add READ policy for user_roles table
DO $$
BEGIN
  CREATE POLICY "Allow authorized roles to SELECT user roles" ON "public"."user_roles" AS permissive
    FOR SELECT TO authenticated
      USING(public.has_permission('roles.read'::public.app_permission )
        OR TRUE );
END
$$;

DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Allow authorized roles to UPDATE user roles') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to UPDATE user roles" ON "public"."user_roles";
  CREATE POLICY "Allow authorized roles to UPDATE user roles" ON "public"."user_roles" AS permissive
    FOR UPDATE TO authenticated
      USING(public.has_permission('roles.update'::public.app_permission ) );
END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Allow authorized roles to DELETE user roles') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to DELETE user roles" ON "public"."user_roles";
  CREATE POLICY "Allow authorized roles to DELETE user roles" ON "public"."user_roles" AS permissive
    FOR DELETE TO authenticated
      USING(public.has_permission('roles.delete'::public.app_permission ) );
END IF;
END
$$;

-- Drop redundant policies that have been consolidated into combined policies
-- These policies are no longer needed since their functionality has been merged
-- into the new combined policies with helper functions
-- Drop the standalone "Users can SELECT user roles" policy
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Users can SELECT user roles') THEN
  DROP POLICY "Users can SELECT user roles" ON "public"."user_roles";
END IF;
END
$$;

-- Drop the "Allow auth admin to read user roles" policy
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Allow auth admin to read user roles') THEN
  DROP POLICY "Allow auth admin to read user roles" ON "public"."user_roles";
END IF;
END
$$;

-- Drop the standalone "Users can SELECT profiles" policy
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can SELECT profiles') THEN
  DROP POLICY "Users can SELECT profiles" ON "public"."profiles";
END IF;
END
$$;

-- Drop the "Authenticated users can CRUD their own vote" policy
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'referendum_votes'
      AND policyname = 'Authenticated users can CRUD their own vote') THEN
  DROP POLICY "Authenticated users can CRUD their own vote" ON "public"."referendum_votes";
END IF;
END
$$;

-- Drop the restrictive "Restrict modification of audit fields for expenses" policy
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'expenses'
      AND policyname = 'Restrict modification of audit fields for expenses') THEN
  DROP POLICY "Restrict modification of audit fields for expenses" ON "public"."expenses";
END IF;
END
$$;

-- Drop the restrictive "Restrict modification of audit fields for games" policy
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'games'
      AND policyname = 'Restrict modification of audit fields for games') THEN
  DROP POLICY "Restrict modification of audit fields for games" ON "public"."games";
END IF;
END
$$;

-- Explicitly drop the old authorize function that uses the old enum type
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_type t ON p.proargtypes[0] = t.oid
    WHERE
      n.nspname = 'public'
      AND p.proname = 'authorize'
      AND t.typname = 'app_permission__old_version_to_be_dropped') THEN
  DROP FUNCTION IF EXISTS public.authorize(app_permission__old_version_to_be_dropped);
END IF;
END
$$;

-- Now it's safe to drop the old type
DROP TYPE "public"."app_permission__old_version_to_be_dropped";

