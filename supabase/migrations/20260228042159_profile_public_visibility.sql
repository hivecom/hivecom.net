-- Add public visibility flag to profiles
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "public" boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "public"."profiles"."public" IS 'Whether a profile is publicly visible';

-- Update SELECT policies for profiles
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
      AND policyname = 'Allow users to SELECT profiles') THEN
    DROP POLICY "Allow users to SELECT profiles" ON "public"."profiles";
  END IF;

  DROP POLICY IF EXISTS "Allow authenticated to SELECT profiles" ON "public"."profiles";
  DROP POLICY IF EXISTS "Allow public to SELECT public profiles" ON "public"."profiles";

  CREATE POLICY "Allow authenticated to SELECT profiles" ON "public"."profiles" AS permissive
    FOR SELECT TO authenticated
      USING(
        public.has_permission('profiles.read'::public.app_permission)
        OR public.has_permission('users.read'::public.app_permission)
        OR public.is_profile_owner(id)
        OR "public" = TRUE
      );

  CREATE POLICY "Allow public to SELECT public profiles" ON "public"."profiles" AS permissive
    FOR SELECT TO anon
      USING("public" = TRUE);
END
$$;
