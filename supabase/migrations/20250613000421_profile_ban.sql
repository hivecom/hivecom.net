-- Add banned and ban_reason columns to profiles table
-- These fields should only be modifiable by admins with specific permissions
ALTER TABLE "public"."profiles"
  ADD COLUMN "banned" boolean NOT NULL DEFAULT FALSE;

ALTER TABLE "public"."profiles"
  ADD COLUMN "ban_reason" text;

ALTER TABLE "public"."profiles"
  ADD COLUMN "ban_start" timestamp with time zone;

ALTER TABLE "public"."profiles"
  ADD COLUMN "ban_end" timestamp with time zone;

-- Add comments to document the purpose of these columns
COMMENT ON COLUMN "public"."profiles"."banned" IS 'Whether the user is banned from the platform';

COMMENT ON COLUMN "public"."profiles"."ban_reason" IS 'Reason for the ban, if the user is banned';

COMMENT ON COLUMN "public"."profiles"."ban_start" IS 'When the ban started';

COMMENT ON COLUMN "public"."profiles"."ban_end" IS 'When the ban ends (null for permanent bans)';

-- Create RLS policies to prevent regular users from modifying ban fields
-- Only users with 'users.update' permission should be able to modify ban status
-- Drop existing profiles UPDATE policy if it exists and recreate with ban field restrictions
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
  DROP POLICY "Allow authorized roles to UPDATE profiles" ON "public"."profiles";
END IF;
END
$$;

-- Create new UPDATE policy that prevents users from modifying their own ban status
CREATE POLICY "Allow authorized roles to UPDATE profiles" ON "public"."profiles" AS permissive
  FOR UPDATE TO authenticated
    USING (
    -- Users can update if they have admin permission OR they own the profile
    public.has_permission('profiles.update'::public.app_permission)
      OR public.is_profile_owner(id))
      WITH CHECK (-- Check permissions and audit fields
(public.has_permission('profiles.update'::public.app_permission) OR public.is_profile_owner(id))
      -- If user is updating their own profile, ensure they cannot modify protected fields
      AND (
      -- Admin users can modify anything
      public.has_permission('users.update'::public.app_permission)
      -- Regular users updating their own profile cannot change protected fields
      OR (public.is_profile_owner(id)
      -- Audit fields protection
      AND created_at IS NOT DISTINCT FROM created_at AND modified_at IS NOT DISTINCT FROM modified_at AND modified_by IS NOT DISTINCT FROM modified_by
      -- Platform connection fields protection
      AND discord_id IS NOT DISTINCT FROM discord_id AND patreon_id IS NOT DISTINCT FROM patreon_id AND steam_id IS NOT DISTINCT FROM steam_id
      -- Supporter status protection
      AND supporter_patreon IS NOT DISTINCT FROM supporter_patreon AND supporter_lifetime IS NOT DISTINCT FROM supporter_lifetime
      -- Ban fields protection
      AND banned IS NOT DISTINCT FROM banned AND ban_reason IS NOT DISTINCT FROM ban_reason AND ban_start IS NOT DISTINCT FROM ban_start AND ban_end IS NOT DISTINCT FROM ban_end)));

-- Add a specific policy for ban management that requires admin permissions
CREATE POLICY "Allow admins to manage user bans" ON "public"."profiles" AS permissive
  FOR UPDATE TO authenticated
    USING (public.has_permission('users.update'::public.app_permission))
    WITH CHECK (public.has_permission('users.update'::public.app_permission)
      AND public.audit_fields_unchanged(created_at, NULL) -- profiles don't have created_by
);

-- Ensure the ban fields are included in the audit trigger (if it exists)
-- Note: This will be handled by the existing audit trigger since it operates on all columns
