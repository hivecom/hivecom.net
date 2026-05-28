-- ============================================================
-- Enforce AAL2 on self-owned write policies for MFA users.
--
-- The authorize()/has_permission() path already gates AAL2 via
-- the has_verified_mfa() check inside authorize(). However,
-- non-RBAC policies that only guard with is_not_banned() allow
-- an MFA-enrolled user with an aal1 (password-only) session to
-- write their own content.
--
-- This migration adds a helper function is_aal2_if_mfa() and
-- threads it into every self-owned write policy that previously
-- only checked is_not_banned().
-- ============================================================

-- ============================================================
-- Helper: passes when the user either has no verified MFA
-- factor, or their current session is at aal2.
-- SECURITY DEFINER because it calls has_verified_mfa() which
-- reads auth.mfa_factors.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_aal2_if_mfa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN public.has_verified_mfa() THEN (auth.jwt() ->> 'aal') = 'aal2'
      ELSE true
    END;
$$;

-- ============================================================
-- discussion_replies
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can create replies" ON public.discussion_replies;
CREATE POLICY "Authenticated users can create replies"
  ON public.discussion_replies
  FOR INSERT
  WITH CHECK (
    (auth.uid() = created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND (EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.agreed_content_rules = true
    ))
    AND (EXISTS (
      SELECT 1 FROM public.discussions d
      WHERE d.id = discussion_replies.discussion_id
        AND (d.is_locked = false OR authorize('discussions.update'::app_permission))
    ))
  );

DROP POLICY IF EXISTS "Users can update their own replies" ON public.discussion_replies;
CREATE POLICY "Users can update their own replies"
  ON public.discussion_replies
  FOR UPDATE
  USING (
    (auth.uid() = created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND (EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.agreed_content_rules = true
    ))
    AND (EXISTS (
      SELECT 1 FROM public.discussions d
      WHERE d.id = discussion_replies.discussion_id AND d.is_locked = false
    ))
  );

DROP POLICY IF EXISTS "Users can delete their own replies" ON public.discussion_replies;
CREATE POLICY "Users can delete their own replies"
  ON public.discussion_replies
  FOR DELETE
  USING (
    (auth.uid() = created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

-- ============================================================
-- discussions
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can create discussions" ON public.discussions;
CREATE POLICY "Authenticated users can create discussions"
  ON public.discussions
  FOR INSERT
  WITH CHECK (
    (auth.uid() = created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND (EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.agreed_content_rules = true
    ))
    AND (
      (
        discussion_topic_id IS NOT NULL
        AND event_id IS NULL
        AND referendum_id IS NULL
        AND project_id IS NULL
        AND gameserver_id IS NULL
        AND (EXISTS (
          SELECT 1 FROM public.discussion_topics dt
          WHERE dt.id = discussions.discussion_topic_id
            AND (dt.is_locked = false OR authorize('discussions.update'::app_permission))
        ))
      )
      OR num_nonnulls(event_id, referendum_id, profile_id, project_id, gameserver_id) > 0
    )
  );

DROP POLICY IF EXISTS "Users can update their own discussions" ON public.discussions;
CREATE POLICY "Users can update their own discussions"
  ON public.discussions
  FOR UPDATE
  USING (
    (auth.uid() = created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND (EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.agreed_content_rules = true
    ))
  );

DROP POLICY IF EXISTS "Users can delete their own discussions" ON public.discussions;
CREATE POLICY "Users can delete their own discussions"
  ON public.discussions
  FOR DELETE
  USING (
    (auth.uid() = created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

-- ============================================================
-- discussion_subscriptions
-- ============================================================

DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.discussion_subscriptions;
CREATE POLICY "Users can insert own subscriptions"
  ON public.discussion_subscriptions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.discussion_subscriptions;
CREATE POLICY "Users can update own subscriptions"
  ON public.discussion_subscriptions
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Users can delete own subscriptions" ON public.discussion_subscriptions;
CREATE POLICY "Users can delete own subscriptions"
  ON public.discussion_subscriptions
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

-- ============================================================
-- event_rsvps
-- ============================================================

DROP POLICY IF EXISTS "Users can insert own RSVPs before event ends" ON public.event_rsvps;
CREATE POLICY "Users can insert own RSVPs before event ends"
  ON public.event_rsvps
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND event_rsvp_window_open(event_id)
  );

DROP POLICY IF EXISTS "Users can update own RSVPs before event ends" ON public.event_rsvps;
CREATE POLICY "Users can update own RSVPs before event ends"
  ON public.event_rsvps
  FOR UPDATE
  USING (
    user_id = (SELECT auth.uid())
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND event_rsvp_window_open(event_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND event_rsvp_window_open(event_id)
  );

DROP POLICY IF EXISTS "Users can delete own RSVPs before event ends" ON public.event_rsvps;
CREATE POLICY "Users can delete own RSVPs before event ends"
  ON public.event_rsvps
  FOR DELETE
  USING (
    user_id = (SELECT auth.uid())
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND event_rsvp_window_open(event_id)
  );

-- ============================================================
-- profile_friends
-- ============================================================

DROP POLICY IF EXISTS "Users can manage own friend relationships" ON public.profile_friends;
CREATE POLICY "Users can manage own friend relationships"
  ON public.profile_friends
  FOR ALL
  USING (
    friender = (SELECT auth.uid())
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  )
  WITH CHECK (
    friender = (SELECT auth.uid())
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Users can delete friend relationships involving them" ON public.profile_friends;
CREATE POLICY "Users can delete friend relationships involving them"
  ON public.profile_friends
  FOR DELETE
  USING (
    (friender = (SELECT auth.uid()) OR friend = (SELECT auth.uid()))
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

-- ============================================================
-- user_notifications
-- ============================================================

DROP POLICY IF EXISTS "System or self can insert notifications" ON public.user_notifications;
CREATE POLICY "System or self can insert notifications"
  ON public.user_notifications
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Users can update own notifications" ON public.user_notifications;
CREATE POLICY "Users can update own notifications"
  ON public.user_notifications
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.user_notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.user_notifications
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

-- ============================================================
-- user_settings
-- ============================================================

DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
CREATE POLICY "Users can insert own settings"
  ON public.user_settings
  FOR INSERT
  WITH CHECK (
    is_owner(id)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
CREATE POLICY "Users can update own settings"
  ON public.user_settings
  FOR UPDATE
  USING (
    is_owner(id)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Users can delete own settings" ON public.user_settings;
CREATE POLICY "Users can delete own settings"
  ON public.user_settings
  FOR DELETE
  USING (
    is_owner(id)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

-- ============================================================
-- profiles (self-edit)
-- ============================================================

DROP POLICY IF EXISTS "Users can UPDATE their information on their profiles" ON public.profiles;
CREATE POLICY "Users can UPDATE their information on their profiles"
  ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  )
  WITH CHECK (
    (auth.uid() = id)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND (NOT (created_at IS DISTINCT FROM created_at))
    AND (NOT (discord_id IS DISTINCT FROM discord_id))
    AND (NOT (patreon_id IS DISTINCT FROM patreon_id))
    AND (NOT (supporter_patreon IS DISTINCT FROM supporter_patreon))
    AND (NOT (supporter_lifetime IS DISTINCT FROM supporter_lifetime))
    AND (NOT (steam_id IS DISTINCT FROM steam_id))
    AND (NOT (badges IS DISTINCT FROM badges))
    AND (NOT (teamspeak_identities IS DISTINCT FROM teamspeak_identities))
    AND (NOT (has_banner IS DISTINCT FROM has_banner))
    AND (NOT (banner_extension IS DISTINCT FROM banner_extension))
  );

-- ============================================================
-- referendums (user-owned private ones)
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can INSERT private referendums" ON public.referendums;
CREATE POLICY "Authenticated users can INSERT private referendums"
  ON public.referendums
  FOR INSERT
  WITH CHECK (
    (is_public = false)
    AND (created_by = auth.uid())
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Authenticated users can UPDATE their own referendums" ON public.referendums;
CREATE POLICY "Authenticated users can UPDATE their own referendums"
  ON public.referendums
  FOR UPDATE
  USING (
    created_by = auth.uid()
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  )
  WITH CHECK (
    (created_by = auth.uid())
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND (is_public = false)
    AND audit_fields_unchanged(created_at, created_by)
  );

-- ============================================================
-- referendum_votes
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can INSERT their own vote" ON public.referendum_votes;
CREATE POLICY "Authenticated users can INSERT their own vote"
  ON public.referendum_votes
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND (user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Authorized users can UPDATE votes" ON public.referendum_votes;
CREATE POLICY "Authorized users can UPDATE votes"
  ON public.referendum_votes
  FOR UPDATE
  USING (
    (has_permission('referendums.update'::app_permission) OR is_owner(user_id))
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  )
  WITH CHECK (
    (has_permission('referendums.update'::app_permission) OR is_owner(user_id))
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Authorized users can DELETE votes" ON public.referendum_votes;
CREATE POLICY "Authorized users can DELETE votes"
  ON public.referendum_votes
  FOR DELETE
  USING (
    (has_permission('referendums.delete'::app_permission) OR is_owner(user_id))
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

-- ============================================================
-- themes (user-owned)
-- ============================================================

DROP POLICY IF EXISTS "Users can create their own themes" ON public.themes;
CREATE POLICY "Users can create their own themes"
  ON public.themes
  FOR INSERT
  WITH CHECK (
    (created_by IS NOT NULL)
    AND is_owner(created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Users can update their own themes" ON public.themes;
CREATE POLICY "Users can update their own themes"
  ON public.themes
  FOR UPDATE
  USING (
    (created_by IS NOT NULL)
    AND is_owner(created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  )
  WITH CHECK (
    (created_by IS NOT NULL)
    AND is_owner(created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Users can delete their own themes" ON public.themes;
CREATE POLICY "Users can delete their own themes"
  ON public.themes
  FOR DELETE
  USING (
    (created_by IS NOT NULL)
    AND is_owner(created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

-- ============================================================
-- complaints (user-owned branch)
-- ============================================================

DROP POLICY IF EXISTS "Users can create own complaints or authorized roles can create" ON public.complaints;
CREATE POLICY "Users can create own complaints or authorized roles can create"
  ON public.complaints
  FOR INSERT
  WITH CHECK (
    (is_owner(created_by) AND public.is_not_banned() AND public.is_aal2_if_mfa())
    OR has_permission('complaints.create'::app_permission)
  );

DROP POLICY IF EXISTS "Users can delete own complaints or authorized roles can delete " ON public.complaints;
CREATE POLICY "Users can delete own complaints or authorized roles can delete"
  ON public.complaints
  FOR DELETE
  USING (
    (is_owner(created_by) AND public.is_not_banned() AND public.is_aal2_if_mfa())
    OR has_permission('complaints.delete'::app_permission)
  );

-- ============================================================
-- profile_points (self visibility toggle)
-- ============================================================

DROP POLICY IF EXISTS "Users can update own profile_points visibility" ON public.profile_points;
CREATE POLICY "Users can update own profile_points visibility"
  ON public.profile_points
  FOR UPDATE
  USING (
    is_owner(profile_id)
    AND public.is_aal2_if_mfa()
  )
  WITH CHECK (
    is_owner(profile_id)
    AND public.is_aal2_if_mfa()
  );
