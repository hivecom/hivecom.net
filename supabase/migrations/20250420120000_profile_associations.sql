ALTER TABLE "public"."profiles"
  ADD COLUMN "discord_id" text;

ALTER TABLE "public"."profiles"
  ADD COLUMN "patreon_id" text;

ALTER TABLE "public"."profiles"
  ADD COLUMN "supporter_patreon" boolean NOT NULL DEFAULT FALSE;

ALTER TABLE "public"."profiles"
  ADD COLUMN "supporter_lifetime" boolean NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX profiles_discord_id_key ON public.profiles USING btree(discord_id);

CREATE UNIQUE INDEX profiles_patreon_id_key ON public.profiles USING btree(patreon_id);

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_discord_id_key" UNIQUE USING INDEX "profiles_discord_id_key";

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_patreon_id_key" UNIQUE USING INDEX "profiles_patreon_id_key";

DROP POLICY "Users can UPDATE their profiles" ON "public"."profiles";

CREATE POLICY "Users can UPDATE their information on their profiles" ON "public"."profiles" AS permissive
  FOR UPDATE TO authenticated
    USING (((
      SELECT
        auth.uid() AS uid) = id))
        WITH CHECK ((((
          SELECT
            auth.uid() AS uid) = id) AND (NOT (created_at IS DISTINCT FROM created_at)) AND (NOT (discord_id IS DISTINCT FROM discord_id)) AND (NOT (patreon_id IS DISTINCT FROM patreon_id)) AND (NOT (supporter_patreon IS DISTINCT FROM supporter_patreon)) AND (NOT (supporter_lifetime IS DISTINCT FROM supporter_lifetime))));

