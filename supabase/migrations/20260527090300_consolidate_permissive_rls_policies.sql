-- Consolidate multiple permissive RLS policies that overlap on the same
-- table/role/action. Postgres evaluates every permissive policy per query;
-- merging overlapping pairs into one policy eliminates that redundant cost.
-- Ref: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

-- ── presences_discord ────────────────────────────────────────────────────────
-- The FOR ALL service_role policy overlaps SELECT with the authenticated policy.
-- Split into: one merged SELECT + explicit INSERT/UPDATE/DELETE for service_role.

DROP POLICY IF EXISTS "Authenticated users can SELECT Discord presences" ON public.presences_discord;
DROP POLICY IF EXISTS "Service role can manage Discord presences" ON public.presences_discord;

CREATE POLICY "Authenticated or service role can SELECT Discord presences"
  ON public.presences_discord
  FOR SELECT
  USING ((SELECT auth.role()) IN ('authenticated', 'service_role'));

CREATE POLICY "Service role can INSERT Discord presences"
  ON public.presences_discord
  FOR INSERT
  WITH CHECK ((SELECT auth.role()) = 'service_role');

CREATE POLICY "Service role can UPDATE Discord presences"
  ON public.presences_discord
  FOR UPDATE
  USING  ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

CREATE POLICY "Service role can DELETE Discord presences"
  ON public.presences_discord
  FOR DELETE
  USING ((SELECT auth.role()) = 'service_role');

-- ── presences_steam ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can SELECT Steam presences" ON public.presences_steam;
DROP POLICY IF EXISTS "Service role can manage Steam presences" ON public.presences_steam;

CREATE POLICY "Authenticated or service role can SELECT Steam presences"
  ON public.presences_steam
  FOR SELECT
  USING ((SELECT auth.role()) IN ('authenticated', 'service_role'));

CREATE POLICY "Service role can INSERT Steam presences"
  ON public.presences_steam
  FOR INSERT
  WITH CHECK ((SELECT auth.role()) = 'service_role');

CREATE POLICY "Service role can UPDATE Steam presences"
  ON public.presences_steam
  FOR UPDATE
  USING  ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

CREATE POLICY "Service role can DELETE Steam presences"
  ON public.presences_steam
  FOR DELETE
  USING ((SELECT auth.role()) = 'service_role');

-- ── presences_lastfm ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can SELECT Last.fm presences" ON public.presences_lastfm;
DROP POLICY IF EXISTS "Service role can manage Last.fm presences" ON public.presences_lastfm;

CREATE POLICY "Authenticated or service role can SELECT Last.fm presences"
  ON public.presences_lastfm
  FOR SELECT
  USING ((SELECT auth.role()) IN ('authenticated', 'service_role'));

CREATE POLICY "Service role can INSERT Last.fm presences"
  ON public.presences_lastfm
  FOR INSERT
  WITH CHECK ((SELECT auth.role()) = 'service_role');

CREATE POLICY "Service role can UPDATE Last.fm presences"
  ON public.presences_lastfm
  FOR UPDATE
  USING  ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

CREATE POLICY "Service role can DELETE Last.fm presences"
  ON public.presences_lastfm
  FOR DELETE
  USING ((SELECT auth.role()) = 'service_role');

-- ── presences_teamspeak ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can SELECT TeamSpeak presences" ON public.presences_teamspeak;
DROP POLICY IF EXISTS "Service role can manage TeamSpeak presences" ON public.presences_teamspeak;

CREATE POLICY "Authenticated or service role can SELECT TeamSpeak presences"
  ON public.presences_teamspeak
  FOR SELECT
  USING ((SELECT auth.role()) IN ('authenticated', 'service_role'));

CREATE POLICY "Service role can INSERT TeamSpeak presences"
  ON public.presences_teamspeak
  FOR INSERT
  WITH CHECK ((SELECT auth.role()) = 'service_role');

CREATE POLICY "Service role can UPDATE TeamSpeak presences"
  ON public.presences_teamspeak
  FOR UPDATE
  USING  ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

CREATE POLICY "Service role can DELETE TeamSpeak presences"
  ON public.presences_teamspeak
  FOR DELETE
  USING ((SELECT auth.role()) = 'service_role');

-- ── discussion_replies UPDATE ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "Discussion authors can update replies in their discussions" ON public.discussion_replies;
DROP POLICY IF EXISTS "Users can update their own replies" ON public.discussion_replies;

CREATE POLICY "Authors and discussion owners can update replies"
  ON public.discussion_replies
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.discussions d
      WHERE d.id = discussion_replies.discussion_id
        AND d.created_by = (SELECT auth.uid())
    )
    OR (
      (SELECT auth.uid()) = created_by
      AND is_not_banned()
      AND is_aal2_if_mfa()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
      )
      AND EXISTS (
        SELECT 1 FROM public.discussions d
        WHERE d.id = discussion_replies.discussion_id AND d.is_locked = false
      )
    )
  );

-- ── event_rsvps INSERT ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to INSERT events_rsvps" ON public.event_rsvps;
DROP POLICY IF EXISTS "Users can insert own RSVPs before event ends" ON public.event_rsvps;

CREATE POLICY "Admins or owners can INSERT event_rsvps"
  ON public.event_rsvps
  FOR INSERT
  WITH CHECK (
    (has_permission('events.create'::app_permission) AND event_rsvp_window_open(event_id))
    OR (
      user_id = (SELECT auth.uid())
      AND is_not_banned()
      AND is_aal2_if_mfa()
      AND event_rsvp_window_open(event_id)
    )
  );

-- ── event_rsvps UPDATE ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE events_rsvps" ON public.event_rsvps;
DROP POLICY IF EXISTS "Users can update own RSVPs before event ends" ON public.event_rsvps;

CREATE POLICY "Admins or owners can UPDATE event_rsvps"
  ON public.event_rsvps
  FOR UPDATE
  USING (
    (has_permission('events.update'::app_permission) AND event_rsvp_window_open(event_id))
    OR (
      user_id = (SELECT auth.uid())
      AND is_not_banned()
      AND is_aal2_if_mfa()
      AND event_rsvp_window_open(event_id)
    )
  )
  WITH CHECK (
    (has_permission('events.update'::app_permission) AND event_rsvp_window_open(event_id))
    OR (
      user_id = (SELECT auth.uid())
      AND is_not_banned()
      AND is_aal2_if_mfa()
      AND event_rsvp_window_open(event_id)
    )
  );

-- ── event_rsvps DELETE ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to DELETE events_rsvps" ON public.event_rsvps;
DROP POLICY IF EXISTS "Users can delete own RSVPs before event ends" ON public.event_rsvps;

CREATE POLICY "Admins or owners can DELETE event_rsvps"
  ON public.event_rsvps
  FOR DELETE
  USING (
    (has_permission('events.delete'::app_permission) AND event_rsvp_window_open(event_id))
    OR (
      user_id = (SELECT auth.uid())
      AND is_not_banned()
      AND is_aal2_if_mfa()
      AND event_rsvp_window_open(event_id)
    )
  );

-- ── events DELETE ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can DELETE events" ON public.events;
DROP POLICY IF EXISTS "Users can DELETE their own non-official events" ON public.events;

CREATE POLICY "Admins or owners can DELETE events"
  ON public.events
  FOR DELETE
  USING (
    has_permission('events.delete'::app_permission)
    OR (
      created_by = (SELECT auth.uid())
      AND is_official = false
      AND is_not_banned()
    )
  );

-- ── profile_points SELECT ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can read all profile_points" ON public.profile_points;
DROP POLICY IF EXISTS "Authenticated users can read public or own profile_points" ON public.profile_points;

CREATE POLICY "Admins, owner, or public can SELECT profile_points"
  ON public.profile_points
  FOR SELECT
  TO authenticated
  USING (
    has_permission('profile_points.read'::app_permission)
    OR (public = true)
    OR is_owner(profile_id)
  );

-- ── profile_point_claims SELECT ───────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can read all profile_point_claims" ON public.profile_point_claims;
DROP POLICY IF EXISTS "Users can SELECT their own point claims" ON public.profile_point_claims;

CREATE POLICY "Admins or self can SELECT profile_point_claims"
  ON public.profile_point_claims
  FOR SELECT
  USING (
    has_permission('profile_points.read'::app_permission)
    OR (email = (SELECT auth.email()))
  );

-- ── profile_point_history SELECT ──────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can read all profile_point_history" ON public.profile_point_history;
DROP POLICY IF EXISTS "Users can read own profile_point_history" ON public.profile_point_history;

CREATE POLICY "Admins or owner can SELECT profile_point_history"
  ON public.profile_point_history
  FOR SELECT
  TO authenticated
  USING (
    has_permission('profile_points.read'::app_permission)
    OR is_owner(profile_id)
  );

-- ── referendums INSERT ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to INSERT referendums" ON public.referendums;
DROP POLICY IF EXISTS "Authenticated users can INSERT private referendums" ON public.referendums;

CREATE POLICY "Admins or owners can INSERT referendums"
  ON public.referendums
  FOR INSERT
  WITH CHECK (
    has_permission('referendums.create'::app_permission)
    OR (
      is_public = false
      AND created_by = (SELECT auth.uid())
      AND is_not_banned()
      AND is_aal2_if_mfa()
    )
  );

-- ── referendums UPDATE ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE referendums" ON public.referendums;
DROP POLICY IF EXISTS "Authenticated users can UPDATE their own referendums" ON public.referendums;

CREATE POLICY "Admins or owners can UPDATE referendums"
  ON public.referendums
  FOR UPDATE
  USING (
    has_permission('referendums.update'::app_permission)
    OR (
      created_by = (SELECT auth.uid())
      AND is_not_banned()
      AND is_aal2_if_mfa()
    )
  )
  WITH CHECK (
    (has_permission('referendums.update'::app_permission) AND audit_fields_unchanged(created_at, created_by))
    OR (
      created_by = (SELECT auth.uid())
      AND is_not_banned()
      AND is_aal2_if_mfa()
      AND is_public = false
      AND audit_fields_unchanged(created_at, created_by)
    )
  );

-- ── themes INSERT ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can create any theme" ON public.themes;
DROP POLICY IF EXISTS "Users can create their own themes" ON public.themes;

CREATE POLICY "Admins or owners can INSERT themes"
  ON public.themes
  FOR INSERT
  WITH CHECK (
    authorize('themes.create'::app_permission)
    OR (
      created_by IS NOT NULL
      AND is_owner(created_by)
      AND is_not_banned()
      AND is_aal2_if_mfa()
    )
  );

-- ── themes UPDATE ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can update any theme" ON public.themes;
DROP POLICY IF EXISTS "Users can update their own themes" ON public.themes;

CREATE POLICY "Admins or owners can UPDATE themes"
  ON public.themes
  FOR UPDATE
  USING (
    authorize('themes.update'::app_permission)
    OR (
      created_by IS NOT NULL
      AND is_owner(created_by)
      AND is_not_banned()
      AND is_aal2_if_mfa()
    )
  )
  WITH CHECK (
    authorize('themes.update'::app_permission)
    OR (
      created_by IS NOT NULL
      AND is_owner(created_by)
      AND is_not_banned()
      AND is_aal2_if_mfa()
    )
  );

-- ── themes DELETE ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can delete any theme" ON public.themes;
DROP POLICY IF EXISTS "Users can delete their own themes" ON public.themes;

CREATE POLICY "Admins or owners can DELETE themes"
  ON public.themes
  FOR DELETE
  USING (
    authorize('themes.delete'::app_permission)
    OR (
      created_by IS NOT NULL
      AND is_owner(created_by)
      AND is_not_banned()
      AND is_aal2_if_mfa()
    )
  );
