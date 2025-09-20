DROP POLICY "Everyone can SELECT user roles" ON "public"."user_roles";

ALTER TABLE "public"."profiles"
  ADD COLUMN "steam_id" text;

CREATE UNIQUE INDEX profiles_steam_id_key ON public.profiles USING btree(steam_id);

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_steam_id_key" UNIQUE USING INDEX "profiles_steam_id_key";

CREATE POLICY "Everyone can SELECT servers" ON "public"."servers" AS permissive
  FOR SELECT TO anon, authenticated
    USING (TRUE);

CREATE POLICY "Users can SELECT user roles" ON "public"."user_roles" AS permissive
  FOR SELECT TO authenticated
    USING (TRUE);

