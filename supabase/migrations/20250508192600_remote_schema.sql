DROP POLICY "Users can UPDATE their information on their profiles" ON "public"."profiles";

CREATE POLICY "Users can UPDATE their information on their profiles" ON "public"."profiles" AS permissive
  FOR UPDATE TO authenticated
    USING (((
      SELECT
        auth.uid() AS uid) = id))
        WITH CHECK ((((
          SELECT
            auth.uid() AS uid) = id) AND (NOT (created_at IS DISTINCT FROM created_at)) AND (NOT (discord_id IS DISTINCT FROM discord_id)) AND (NOT (patreon_id IS DISTINCT FROM patreon_id)) AND (NOT (supporter_patreon IS DISTINCT FROM supporter_patreon)) AND (NOT (supporter_lifetime IS DISTINCT FROM supporter_lifetime)) AND (NOT (steam_id IS DISTINCT FROM steam_id))));

