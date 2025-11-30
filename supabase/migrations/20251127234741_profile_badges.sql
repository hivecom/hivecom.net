CREATE TYPE "public"."profile_badge" AS ENUM (
	'founder',
	'earlybird',
    'builder'
);

ALTER TABLE "public"."profiles"
	ADD COLUMN "badges" "public"."profile_badge"[] NOT NULL DEFAULT '{}'::"public"."profile_badge"[];

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'profiles'
			AND policyname = 'Allow authorized roles to UPDATE profiles'
	) THEN
		DROP POLICY "Allow authorized roles to UPDATE profiles" ON "public"."profiles";
	END IF;
END
$$;

CREATE POLICY "Allow authorized roles to UPDATE profiles" ON "public"."profiles" AS permissive
	FOR UPDATE TO authenticated
		USING (
			public.has_permission('profiles.update'::public.app_permission)
			OR public.is_profile_owner(id)
		)
		WITH CHECK (
			(
				public.has_permission('profiles.update'::public.app_permission)
				OR public.is_profile_owner(id)
			)
			AND (
				public.has_permission('users.update'::public.app_permission)
				OR (
					public.is_profile_owner(id)
					AND created_at IS NOT DISTINCT FROM created_at
					AND modified_at IS NOT DISTINCT FROM modified_at
					AND modified_by IS NOT DISTINCT FROM modified_by
					AND discord_id IS NOT DISTINCT FROM discord_id
					AND patreon_id IS NOT DISTINCT FROM patreon_id
					AND steam_id IS NOT DISTINCT FROM steam_id
					AND supporter_patreon IS NOT DISTINCT FROM supporter_patreon
					AND supporter_lifetime IS NOT DISTINCT FROM supporter_lifetime
					AND badges IS NOT DISTINCT FROM badges
					AND banned IS NOT DISTINCT FROM banned
					AND ban_reason IS NOT DISTINCT FROM ban_reason
					AND ban_start IS NOT DISTINCT FROM ban_start
					AND ban_end IS NOT DISTINCT FROM ban_end
				)
			)
		);
