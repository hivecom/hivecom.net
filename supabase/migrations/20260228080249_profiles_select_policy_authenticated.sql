-- Restore authenticated profile visibility policy so logged-in users can view other users' profiles
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow authenticated to SELECT profiles" ON "public"."profiles";
  DROP POLICY IF EXISTS "Allow users to SELECT profiles" ON "public"."profiles";

  CREATE POLICY "Allow authenticated to SELECT profiles" ON "public"."profiles" AS permissive
    FOR SELECT TO authenticated
      USING(
        public.has_permission('profiles.read'::public.app_permission)
        OR public.has_permission('users.read'::public.app_permission)
        OR public.is_profile_owner(id)
        OR TRUE
      );
END
$$;
