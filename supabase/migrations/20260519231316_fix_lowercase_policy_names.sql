-- Rename all RLS policies that were created with lowercase/snake_case names
-- to match the project convention: sentence-case, human-readable strings.
--
-- Affected tables:
--   public.presences_discord         (2 policies)
--   public.presences_steam           (2 policies)
--   public.presences_teamspeak       (2 policies)
--   public.presences_lastfm          (2 policies)
--   public.profile_point_claims      (1 policy)
--   public.profile_badge_definitions (1 policy)
--   public.profile_badges            (1 policy)
--   public.projects                  (4 policies)
--   private.teamspeak_tokens         (1 policy)

-- =============================================================================
-- public.presences_discord
-- =============================================================================

DROP POLICY IF EXISTS "presences_discord_select_authenticated" ON public.presences_discord;
CREATE POLICY "Authenticated users can SELECT Discord presences"
  ON public.presences_discord
  FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "presences_discord_service_writes" ON public.presences_discord;
CREATE POLICY "Service role can manage Discord presences"
  ON public.presences_discord
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- =============================================================================
-- public.presences_steam
-- =============================================================================

DROP POLICY IF EXISTS "presences_steam_select_authenticated" ON public.presences_steam;
CREATE POLICY "Authenticated users can SELECT Steam presences"
  ON public.presences_steam
  FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "presences_steam_service_writes" ON public.presences_steam;
CREATE POLICY "Service role can manage Steam presences"
  ON public.presences_steam
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- =============================================================================
-- public.presences_teamspeak
-- =============================================================================

DROP POLICY IF EXISTS "presences_teamspeak_select_authenticated" ON public.presences_teamspeak;
CREATE POLICY "Authenticated users can SELECT TeamSpeak presences"
  ON public.presences_teamspeak
  FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "presences_teamspeak_service_writes" ON public.presences_teamspeak;
CREATE POLICY "Service role can manage TeamSpeak presences"
  ON public.presences_teamspeak
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- =============================================================================
-- public.presences_lastfm
-- =============================================================================

DROP POLICY IF EXISTS "presences_lastfm_select_authenticated" ON public.presences_lastfm;
DROP POLICY IF EXISTS "Authenticated users can SELECT Last.fm presences" ON public.presences_lastfm;
CREATE POLICY "Authenticated users can SELECT Last.fm presences"
  ON public.presences_lastfm
  FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "presences_lastfm_service_writes" ON public.presences_lastfm;
DROP POLICY IF EXISTS "Service role can manage Last.fm presences" ON public.presences_lastfm;
CREATE POLICY "Service role can manage Last.fm presences"
  ON public.presences_lastfm
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- =============================================================================
-- public.profile_point_claims
-- =============================================================================

DROP POLICY IF EXISTS "profile_point_claims_select_own" ON public.profile_point_claims;
CREATE POLICY "Users can SELECT their own point claims"
  ON public.profile_point_claims
  FOR SELECT
  USING (email = (SELECT auth.email()));

-- =============================================================================
-- public.profile_badge_definitions
-- =============================================================================

DROP POLICY IF EXISTS "public read profile_badge_definitions" ON public.profile_badge_definitions;
CREATE POLICY "Anyone can SELECT badge definitions"
  ON public.profile_badge_definitions
  FOR SELECT
  USING (true);

-- =============================================================================
-- public.profile_badges
-- =============================================================================

DROP POLICY IF EXISTS "public read profile_badges" ON public.profile_badges;
CREATE POLICY "Anyone can SELECT profile badges"
  ON public.profile_badges
  FOR SELECT
  USING (true);

-- =============================================================================
-- public.projects
-- =============================================================================

DROP POLICY IF EXISTS "projects_select_policy" ON public.projects;
CREATE POLICY "Anyone can SELECT projects"
  ON public.projects AS PERMISSIVE
  FOR SELECT TO authenticated, anon
  USING (TRUE);

DROP POLICY IF EXISTS "projects_insert_policy" ON public.projects;
CREATE POLICY "Authorized users can INSERT projects"
  ON public.projects AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    authorize('projects.create'::app_permission)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
    )
  );

DROP POLICY IF EXISTS "projects_update_policy" ON public.projects;
CREATE POLICY "Authorized users can UPDATE projects"
  ON public.projects AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (
    authorize('projects.update'::app_permission)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
    )
  );

DROP POLICY IF EXISTS "projects_delete_policy" ON public.projects;
CREATE POLICY "Authorized users can DELETE projects"
  ON public.projects AS PERMISSIVE
  FOR DELETE TO authenticated
  USING (authorize('projects.delete'::app_permission));

-- =============================================================================
-- private.teamspeak_tokens
-- =============================================================================

DROP POLICY IF EXISTS "teamspeak_tokens service role only" ON private.teamspeak_tokens;
CREATE POLICY "Service role can manage TeamSpeak tokens"
  ON private.teamspeak_tokens
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');
