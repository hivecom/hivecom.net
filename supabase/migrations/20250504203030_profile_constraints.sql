DROP POLICY "Users can UPDATE their information on their profiles" ON "public"."profiles";

ALTER TABLE "public"."profiles"
  ADD COLUMN "username_set" boolean NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX profiles_username_unique ON public.profiles USING btree(LOWER(username));

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "markdown_length_check" CHECK ((CHAR_LENGTH(markdown) <= 8128)) NOT valid;

ALTER TABLE "public"."profiles" validate CONSTRAINT "markdown_length_check";

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "subtitle_length_check" CHECK ((CHAR_LENGTH(subtitle) <= 128)) NOT valid;

ALTER TABLE "public"."profiles" validate CONSTRAINT "subtitle_length_check";

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "title_length_check" CHECK ((CHAR_LENGTH(title) <= 128)) NOT valid;

ALTER TABLE "public"."profiles" validate CONSTRAINT "title_length_check";

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "username_length_check" CHECK ((CHAR_LENGTH(username) <= 32)) NOT valid;

ALTER TABLE "public"."profiles" validate CONSTRAINT "username_length_check";

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "username_no_spaces" CHECK ((username !~ '\\s'::text)) NOT valid;

ALTER TABLE "public"."profiles" validate CONSTRAINT "username_no_spaces";

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "username_valid_chars" CHECK ((username ~ '^[a-zA-Z0-9!@#$%^&*()_+={};''":|,.<>\\/?-]+$'::text)) NOT valid;

ALTER TABLE "public"."profiles" validate CONSTRAINT "username_valid_chars";

CREATE POLICY "Users can UPDATE their information on their profiles" ON "public"."profiles" AS permissive
  FOR UPDATE TO authenticated
    USING (((
      SELECT
        auth.uid() AS uid) = id))
        WITH CHECK ((((
          SELECT
            auth.uid() AS uid) = id) AND (NOT (created_at IS DISTINCT FROM created_at)) AND (NOT (discord_id IS DISTINCT FROM discord_id)) AND (NOT (patreon_id IS DISTINCT FROM patreon_id)) AND (NOT (supporter_patreon IS DISTINCT FROM supporter_patreon)) AND (NOT (supporter_lifetime IS DISTINCT FROM supporter_lifetime)) AND (steam_id IS DISTINCT FROM steam_id)));

