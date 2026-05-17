-- ============================================================
-- Fix auth_rls_initplan performance warnings.
--
-- Bare auth.<fn>() calls in RLS policies are re-evaluated for
-- every row. Wrapping them in (SELECT auth.<fn>()) causes the
-- planner to evaluate them once per statement instead.
--
-- Affected policies (as reported by the Supabase linter):
--   public.discussion_replies        - 2 policies
--   public.discussion_subscriptions  - 1 policy
--   public.discussions               - 1 policy
--   public.events                    - 5 policies
--   public.network_gameservers       - 2 policies
--   public.presences_discord         - 2 policies
--   public.presences_steam           - 2 policies
--   public.presences_teamspeak       - 2 policies
--   public.profile_point_claims      - 1 policy
--   public.projects                  - 2 policies
--   public.user_notifications        - 2 policies
--   private.teamspeak_tokens         - 1 policy
-- ============================================================

-- ============================================================
-- discussion_replies
-- ============================================================

DROP POLICY IF EXISTS "Everyone can view replies" ON public.discussion_replies;
CREATE POLICY "Everyone can view replies"
  ON public.discussion_replies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.discussions d
      WHERE d.id = discussion_replies.discussion_id
        AND (
          d.is_draft = false
          OR ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = d.created_by)
          OR authorize('discussions.update'::app_permission)
        )
    )
  );

DROP POLICY IF EXISTS "Discussion authors can update replies in their discussions" ON public.discussion_replies;
CREATE POLICY "Discussion authors can update replies in their discussions"
  ON public.discussion_replies
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.discussions d
      WHERE d.id = discussion_replies.discussion_id
        AND d.created_by = (SELECT auth.uid())
    )
  );

-- ============================================================
-- discussion_subscriptions
-- ============================================================

DROP POLICY IF EXISTS "Users can read own subscriptions" ON public.discussion_subscriptions;
CREATE POLICY "Users can read own subscriptions"
  ON public.discussion_subscriptions
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- discussions
-- ============================================================

DROP POLICY IF EXISTS "Everyone can view discussions" ON public.discussions;
CREATE POLICY "Everyone can view discussions"
  ON public.discussions
  FOR SELECT
  USING (
    ((is_draft = false) AND (is_nsfw = false))
    OR ((SELECT auth.uid()) IS NOT NULL AND is_draft = false)
    OR ((SELECT auth.uid()) = created_by)
    OR authorize('discussions.update'::app_permission)
  );

-- ============================================================
-- events
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can SELECT all events" ON public.events;
CREATE POLICY "Authenticated users can SELECT all events"
  ON public.events
  FOR SELECT
  USING (is_official = true OR (SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Only admins can update is_official on events" ON public.events;
CREATE POLICY "Only admins can update is_official on events"
  ON public.events
  FOR UPDATE
  USING (
    CASE
      WHEN is_official THEN (has_permission('events.update'::app_permission) OR created_by = (SELECT auth.uid()))
      ELSE true
    END
  )
  WITH CHECK (
    CASE
      WHEN is_official THEN has_permission('events.update'::app_permission)
      ELSE true
    END
  );

DROP POLICY IF EXISTS "Users can DELETE their own non-official events" ON public.events;
CREATE POLICY "Users can DELETE their own non-official events"
  ON public.events
  FOR DELETE
  USING (
    created_by = (SELECT auth.uid())
    AND is_official = false
    AND public.is_not_banned()
  );

DROP POLICY IF EXISTS "Users can INSERT non-official events" ON public.events;
CREATE POLICY "Users can INSERT non-official events"
  ON public.events
  FOR INSERT
  WITH CHECK (
    is_official = false
    AND created_by = (SELECT auth.uid())
    AND public.is_not_banned()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
    )
  );

DROP POLICY IF EXISTS "Users can UPDATE their own events" ON public.events;
CREATE POLICY "Users can UPDATE their own events"
  ON public.events
  FOR UPDATE
  USING (
    created_by = (SELECT auth.uid())
    AND public.is_not_banned()
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND is_official = false
    AND public.is_not_banned()
    AND audit_fields_unchanged(created_at, created_by)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
    )
  );

-- ============================================================
-- network_gameservers
-- ============================================================

DROP POLICY IF EXISTS "Allow authorized roles to INSERT gameservers" ON public.network_gameservers;
CREATE POLICY "Allow authorized roles to INSERT gameservers"
  ON public.network_gameservers
  FOR INSERT
  WITH CHECK (
    has_permission('network.create'::app_permission)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
    )
  );

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE gameservers" ON public.network_gameservers;
CREATE POLICY "Allow authorized roles to UPDATE gameservers"
  ON public.network_gameservers
  FOR UPDATE
  USING (
    has_permission('network.update'::app_permission)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
    )
  );

-- ============================================================
-- presences_discord
-- ============================================================

DROP POLICY IF EXISTS "presences_discord_select_authenticated" ON public.presences_discord;
CREATE POLICY "presences_discord_select_authenticated"
  ON public.presences_discord
  FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "presences_discord_service_writes" ON public.presences_discord;
CREATE POLICY "presences_discord_service_writes"
  ON public.presences_discord
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ============================================================
-- presences_steam
-- ============================================================

DROP POLICY IF EXISTS "presences_steam_select_authenticated" ON public.presences_steam;
CREATE POLICY "presences_steam_select_authenticated"
  ON public.presences_steam
  FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "presences_steam_service_writes" ON public.presences_steam;
CREATE POLICY "presences_steam_service_writes"
  ON public.presences_steam
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ============================================================
-- presences_teamspeak
-- ============================================================

DROP POLICY IF EXISTS "presences_teamspeak_select_authenticated" ON public.presences_teamspeak;
CREATE POLICY "presences_teamspeak_select_authenticated"
  ON public.presences_teamspeak
  FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "presences_teamspeak_service_writes" ON public.presences_teamspeak;
CREATE POLICY "presences_teamspeak_service_writes"
  ON public.presences_teamspeak
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ============================================================
-- profile_point_claims
-- ============================================================

DROP POLICY IF EXISTS "profile_point_claims_select_own" ON public.profile_point_claims;
CREATE POLICY "profile_point_claims_select_own"
  ON public.profile_point_claims
  FOR SELECT
  USING (email = (SELECT auth.email()));

-- ============================================================
-- projects
-- ============================================================

DROP POLICY IF EXISTS "projects_insert_policy" ON public.projects;
CREATE POLICY "projects_insert_policy"
  ON public.projects
  FOR INSERT
  WITH CHECK (
    authorize('projects.create'::app_permission)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
    )
  );

DROP POLICY IF EXISTS "projects_update_policy" ON public.projects;
CREATE POLICY "projects_update_policy"
  ON public.projects
  FOR UPDATE
  USING (
    authorize('projects.update'::app_permission)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
    )
  );

-- ============================================================
-- user_notifications
-- Re-issue the two policies from 20260517062630 that still had
-- bare auth.uid() calls (the INSERT and SELECT policies).
-- ============================================================

DROP POLICY IF EXISTS "System or self can insert notifications" ON public.user_notifications;
CREATE POLICY "System or self can insert notifications"
  ON public.user_notifications
  FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Users can read own notifications" ON public.user_notifications;
CREATE POLICY "Users can read own notifications"
  ON public.user_notifications
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- private.teamspeak_tokens
-- ============================================================

DROP POLICY IF EXISTS "teamspeak_tokens service role only" ON private.teamspeak_tokens;
CREATE POLICY "teamspeak_tokens service role only"
  ON private.teamspeak_tokens
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');
