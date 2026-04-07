-- ============================================================
-- Helper: is the current user actively banned?
-- SECURITY DEFINER so it bypasses RLS on profiles (avoids
-- infinite recursion when called from policies on that table).
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_not_banned()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND banned = true
      AND (ban_end IS NULL OR ban_end > now())
  );
$$;

-- ============================================================
-- Helper: does the current user have at least one verified
-- TOTP factor enrolled?
-- SECURITY DEFINER required to read auth.mfa_factors.
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_verified_mfa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.mfa_factors
    WHERE user_id = auth.uid()
      AND factor_type = 'totp'
      AND status = 'verified'
  );
$$;

-- ============================================================
-- Extend authorize() to enforce ban status and AAL.
-- Any user that is banned is denied regardless of their role.
-- Any user with verified MFA must be at aal2 to use privileged
-- permissions - aal1 (password-only session) is not enough.
-- ============================================================
CREATE OR REPLACE FUNCTION public.authorize(requested_permission app_permission)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  -- Gate 1: banned users are always denied.
  IF NOT public.is_not_banned() THEN
    RETURN false;
  END IF;

  -- Gate 2: if the user has MFA enrolled their session must be at aal2.
  IF public.has_verified_mfa() AND (auth.jwt() ->> 'aal') <> 'aal2' THEN
    RETURN false;
  END IF;

  -- Gate 3: role-permission check (unchanged).
  v_role := public.current_user_role();

  RETURN EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    WHERE rp.role       = v_role
      AND rp.permission = requested_permission
  );
END;
$$;

-- ============================================================
-- Non-RBAC write policies: add ban check.
-- We drop and recreate each affected policy so that a banned
-- user cannot INSERT/UPDATE/DELETE their own content even with
-- a still-valid access token.
-- ============================================================

-- ---------- discussion_replies ----------

DROP POLICY IF EXISTS "Users can delete their own replies" ON public.discussion_replies;
CREATE POLICY "Users can delete their own replies"
  ON public.discussion_replies
  FOR DELETE
  USING (auth.uid() = created_by AND public.is_not_banned());

DROP POLICY IF EXISTS "Users can update their own replies" ON public.discussion_replies;
CREATE POLICY "Users can update their own replies"
  ON public.discussion_replies
  FOR UPDATE
  USING (
    (auth.uid() = created_by)
    AND public.is_not_banned()
    AND (EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.agreed_content_rules = true
    ))
    AND (EXISTS (
      SELECT 1 FROM discussions d
      WHERE d.id = discussion_replies.discussion_id AND d.is_locked = false
    ))
  );

DROP POLICY IF EXISTS "Authenticated users can create replies" ON public.discussion_replies;
CREATE POLICY "Authenticated users can create replies"
  ON public.discussion_replies
  FOR INSERT
  WITH CHECK (
    (auth.uid() = created_by)
    AND public.is_not_banned()
    AND (EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.agreed_content_rules = true
    ))
    AND (EXISTS (
      SELECT 1 FROM discussions d
      WHERE d.id = discussion_replies.discussion_id
        AND (d.is_locked = false OR authorize('discussions.update'::app_permission))
    ))
  );

-- ---------- discussions ----------

DROP POLICY IF EXISTS "Users can delete their own discussions" ON public.discussions;
CREATE POLICY "Users can delete their own discussions"
  ON public.discussions
  FOR DELETE
  USING (auth.uid() = created_by AND public.is_not_banned());

DROP POLICY IF EXISTS "Users can update their own discussions" ON public.discussions;
CREATE POLICY "Users can update their own discussions"
  ON public.discussions
  FOR UPDATE
  USING (
    (auth.uid() = created_by)
    AND public.is_not_banned()
    AND (EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.agreed_content_rules = true
    ))
  );

DROP POLICY IF EXISTS "Authenticated users can create discussions" ON public.discussions;
CREATE POLICY "Authenticated users can create discussions"
  ON public.discussions
  FOR INSERT
  WITH CHECK (
    (auth.uid() = created_by)
    AND public.is_not_banned()
    AND (EXISTS (
      SELECT 1 FROM profiles p
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
          SELECT 1 FROM discussion_topics dt
          WHERE dt.id = discussions.discussion_topic_id
            AND (dt.is_locked = false OR authorize('discussions.update'::app_permission))
        ))
      )
      OR num_nonnulls(event_id, referendum_id, profile_id, project_id, gameserver_id) > 0
    )
  );

-- ---------- discussion_subscriptions ----------

DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.discussion_subscriptions;
CREATE POLICY "Users can insert own subscriptions"
  ON public.discussion_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_not_banned());

DROP POLICY IF EXISTS "Users can delete own subscriptions" ON public.discussion_subscriptions;
CREATE POLICY "Users can delete own subscriptions"
  ON public.discussion_subscriptions
  FOR DELETE
  USING (auth.uid() = user_id AND public.is_not_banned());

DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.discussion_subscriptions;
CREATE POLICY "Users can update own subscriptions"
  ON public.discussion_subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id AND public.is_not_banned());

-- ---------- events_rsvps ----------

DROP POLICY IF EXISTS "Users can insert own RSVPs before event ends" ON public.events_rsvps;
CREATE POLICY "Users can insert own RSVPs before event ends"
  ON public.events_rsvps
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.is_not_banned()
    AND event_rsvp_window_open(event_id)
  );

DROP POLICY IF EXISTS "Users can update own RSVPs before event ends" ON public.events_rsvps;
CREATE POLICY "Users can update own RSVPs before event ends"
  ON public.events_rsvps
  FOR UPDATE
  USING (
    user_id = (SELECT auth.uid())
    AND public.is_not_banned()
    AND event_rsvp_window_open(event_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.is_not_banned()
    AND event_rsvp_window_open(event_id)
  );

DROP POLICY IF EXISTS "Users can delete own RSVPs before event ends" ON public.events_rsvps;
CREATE POLICY "Users can delete own RSVPs before event ends"
  ON public.events_rsvps
  FOR DELETE
  USING (
    user_id = (SELECT auth.uid())
    AND public.is_not_banned()
    AND event_rsvp_window_open(event_id)
  );

-- ---------- friends ----------

DROP POLICY IF EXISTS "Users can manage own friend relationships" ON public.friends;
CREATE POLICY "Users can manage own friend relationships"
  ON public.friends
  FOR ALL
  USING (friender = (SELECT auth.uid()) AND public.is_not_banned())
  WITH CHECK (friender = (SELECT auth.uid()) AND public.is_not_banned());

DROP POLICY IF EXISTS "Users can delete friend relationships involving them" ON public.friends;
CREATE POLICY "Users can delete friend relationships involving them"
  ON public.friends
  FOR DELETE
  USING (
    (friender = (SELECT auth.uid()) OR friend = (SELECT auth.uid()))
    AND public.is_not_banned()
  );

-- ---------- notifications ----------

DROP POLICY IF EXISTS "System or self can insert notifications" ON public.notifications;
CREATE POLICY "System or self can insert notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_not_banned());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id AND public.is_not_banned());

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications
  FOR DELETE
  USING (auth.uid() = user_id AND public.is_not_banned());

-- ---------- profiles (self-edit) ----------

DROP POLICY IF EXISTS "Users can UPDATE their information on their profiles" ON public.profiles;
CREATE POLICY "Users can UPDATE their information on their profiles"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id AND public.is_not_banned())
  WITH CHECK (
    (auth.uid() = id)
    AND public.is_not_banned()
    AND (NOT (created_at IS DISTINCT FROM created_at))
    AND (NOT (discord_id IS DISTINCT FROM discord_id))
    AND (NOT (patreon_id IS DISTINCT FROM patreon_id))
    AND (NOT (supporter_patreon IS DISTINCT FROM supporter_patreon))
    AND (NOT (supporter_lifetime IS DISTINCT FROM supporter_lifetime))
    AND (NOT (steam_id IS DISTINCT FROM steam_id))
    AND (NOT (badges IS DISTINCT FROM badges))
    AND (NOT (teamspeak_identities IS DISTINCT FROM teamspeak_identities))
  );

-- ---------- referendum_votes ----------

DROP POLICY IF EXISTS "Authorized users can INSERT votes" ON public.referendum_votes;
CREATE POLICY "Authorized users can INSERT votes"
  ON public.referendum_votes
  FOR INSERT
  WITH CHECK (has_permission('referendums.create'::app_permission) AND public.is_not_banned());

DROP POLICY IF EXISTS "Authorized users can UPDATE votes" ON public.referendum_votes;
CREATE POLICY "Authorized users can UPDATE votes"
  ON public.referendum_votes
  FOR UPDATE
  USING (
    (has_permission('referendums.update'::app_permission) OR is_owner(user_id))
    AND public.is_not_banned()
  )
  WITH CHECK (
    (has_permission('referendums.update'::app_permission) OR is_owner(user_id))
    AND public.is_not_banned()
  );

DROP POLICY IF EXISTS "Authorized users can DELETE votes" ON public.referendum_votes;
CREATE POLICY "Authorized users can DELETE votes"
  ON public.referendum_votes
  FOR DELETE
  USING (
    (has_permission('referendums.delete'::app_permission) OR is_owner(user_id))
    AND public.is_not_banned()
  );

-- ---------- referendums (user-owned private ones) ----------

DROP POLICY IF EXISTS "Authenticated users can INSERT private referendums" ON public.referendums;
CREATE POLICY "Authenticated users can INSERT private referendums"
  ON public.referendums
  FOR INSERT
  WITH CHECK (
    (is_public = false)
    AND (created_by = auth.uid())
    AND public.is_not_banned()
  );

DROP POLICY IF EXISTS "Authenticated users can UPDATE their own referendums" ON public.referendums;
CREATE POLICY "Authenticated users can UPDATE their own referendums"
  ON public.referendums
  FOR UPDATE
  USING (created_by = auth.uid() AND public.is_not_banned())
  WITH CHECK (
    (created_by = auth.uid())
    AND public.is_not_banned()
    AND (is_public = false)
    AND audit_fields_unchanged(created_at, created_by)
  );

-- ---------- settings ----------

DROP POLICY IF EXISTS "Users can insert own settings" ON public.settings;
CREATE POLICY "Users can insert own settings"
  ON public.settings
  FOR INSERT
  WITH CHECK (is_owner(id) AND public.is_not_banned());

DROP POLICY IF EXISTS "Users can update own settings" ON public.settings;
CREATE POLICY "Users can update own settings"
  ON public.settings
  FOR UPDATE
  USING (is_owner(id) AND public.is_not_banned());

DROP POLICY IF EXISTS "Users can delete own settings" ON public.settings;
CREATE POLICY "Users can delete own settings"
  ON public.settings
  FOR DELETE
  USING (is_owner(id) AND public.is_not_banned());

-- ---------- themes ----------

DROP POLICY IF EXISTS "Users can create their own themes" ON public.themes;
CREATE POLICY "Users can create their own themes"
  ON public.themes
  FOR INSERT
  WITH CHECK ((created_by IS NOT NULL) AND is_owner(created_by) AND public.is_not_banned());

DROP POLICY IF EXISTS "Users can update their own themes" ON public.themes;
CREATE POLICY "Users can update their own themes"
  ON public.themes
  FOR UPDATE
  USING ((created_by IS NOT NULL) AND is_owner(created_by) AND public.is_not_banned())
  WITH CHECK ((created_by IS NOT NULL) AND is_owner(created_by) AND public.is_not_banned());

DROP POLICY IF EXISTS "Users can delete their own themes" ON public.themes;
CREATE POLICY "Users can delete their own themes"
  ON public.themes
  FOR DELETE
  USING ((created_by IS NOT NULL) AND is_owner(created_by) AND public.is_not_banned());

-- ---------- complaints ----------

DROP POLICY IF EXISTS "Users can create own complaints or authorized roles can create" ON public.complaints;
CREATE POLICY "Users can create own complaints or authorized roles can create"
  ON public.complaints
  FOR INSERT
  WITH CHECK (
    (is_owner(created_by) AND public.is_not_banned())
    OR has_permission('complaints.create'::app_permission)
  );

DROP POLICY IF EXISTS "Users can delete own complaints or authorized roles can delete " ON public.complaints;
CREATE POLICY "Users can delete own complaints or authorized roles can delete"
  ON public.complaints
  FOR DELETE
  USING (
    (is_owner(created_by) AND public.is_not_banned())
    OR has_permission('complaints.delete'::app_permission)
  );
