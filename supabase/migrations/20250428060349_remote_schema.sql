-- Rename the existing enum type
ALTER TYPE "public"."app_permission" RENAME TO "app_permission__old_version_to_be_dropped";

-- Create the new enum type with the same values
CREATE TYPE "public"."app_permission" AS enum(
  'events.crud',
  'games.crud',
  'gameservers.crud',
  'funding.crud',
  'profiles.crud',
  'users.crud',
  'referendums.crud',
  'servers.crud',
  'expenses.crud',
  'containers.crud'
);

-- Update the table to use the new enum type
ALTER TABLE "public"."role_permissions"
  ALTER COLUMN permission TYPE "public"."app_permission"
  USING permission::text::"public"."app_permission";

-- Set check_function_bodies to OFF for function creation
SET check_function_bodies = OFF;

-- Create the new authorize function first that uses the new enum type
-- This will replace any existing one with the same signature
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

-- Create or replace any authorize function without parameters
CREATE OR REPLACE FUNCTION public.authorize()
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
  RETURN FALSE;
  -- Default implementation
END;
$function$;

-- Update all policy references to use the new type instead of the old one
-- We need to update all the policies that depend on the old type
-- Update policies for events table
DO $$
BEGIN
  -- Check if the policy exists before trying to drop it
  IF EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'events'
      AND policyname = 'Allow authorized roles to CRUD events') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to CRUD events" ON "public"."events";
  CREATE POLICY "Allow authorized roles to CRUD events" ON "public"."events"
    USING(public.authorize('events.crud'::public.app_permission ) );
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
      AND policyname = 'Allow authorized roles to CRUD games') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to CRUD games" ON "public"."games";
  CREATE POLICY "Allow authorized roles to CRUD games" ON "public"."games"
    USING(public.authorize('games.crud'::public.app_permission ) );
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
      AND policyname = 'Allow authorized roles to CRUD gameservers') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to CRUD gameservers" ON "public"."gameservers";
  CREATE POLICY "Allow authorized roles to CRUD gameservers" ON "public"."gameservers"
    USING(public.authorize('gameservers.crud'::public.app_permission ) );
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
      AND policyname = 'Allow authorized roles to CRUD profiles') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to CRUD profiles" ON "public"."profiles";
  CREATE POLICY "Allow authorized roles to CRUD profiles" ON "public"."profiles"
    USING(public.authorize('profiles.crud'::public.app_permission ) );
END IF;
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
      AND policyname = 'Allow authorized roles to CRUD referendums') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to CRUD referendums" ON "public"."referendums";
  CREATE POLICY "Allow authorized roles to CRUD referendums" ON "public"."referendums"
    USING(public.authorize('referendums.crud'::public.app_permission ) );
END IF;
END
$$;

-- Update policies for user_roles table
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
      AND policyname = 'Allow authorized roles to CRUD user roles') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to CRUD user roles" ON "public"."user_roles";
  CREATE POLICY "Allow authorized roles to CRUD user roles" ON "public"."user_roles"
    USING(public.authorize('users.crud'::public.app_permission ) );
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
      AND policyname = 'Authorized users can CRUD votes') THEN
  DROP POLICY IF EXISTS "Authorized users can CRUD votes" ON "public"."referendum_votes";
  CREATE POLICY "Authorized users can CRUD votes" ON "public"."referendum_votes"
    USING(public.authorize('referendums.crud'::public.app_permission ) );
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
      AND policyname = 'Allow authorized roles to CRUD expenses') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to CRUD expenses" ON "public"."expenses";
  CREATE POLICY "Allow authorized roles to CRUD expenses" ON "public"."expenses"
    USING(public.authorize('expenses.crud'::public.app_permission ) );
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
      AND policyname = 'Allow authorized roles to CRUD servers') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to CRUD servers" ON "public"."servers";
  CREATE POLICY "Allow authorized roles to CRUD servers" ON "public"."servers"
    USING(public.authorize('servers.crud'::public.app_permission ) );
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
      AND policyname = 'Allow authorized roles to CRUD games in storage') THEN
  DROP POLICY IF EXISTS "Allow authorized roles to CRUD games in storage" ON "storage"."objects";
  CREATE POLICY "Allow authorized roles to CRUD games in storage" ON "storage"."objects"
    USING(public.authorize('games.crud'::public.app_permission ) );
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

