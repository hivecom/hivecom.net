-- ============================================================
-- Fix remaining bare auth.uid() calls in RLS policies.
--
-- These policies were rewritten by 20260517062630 (AAL2) but
-- still contained bare auth.uid() references that the planner
-- re-evaluates per row. Wrap them with (SELECT auth.uid()).
-- ============================================================

-- ============================================================
-- discussion_replies
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can create replies" ON public.discussion_replies;
CREATE POLICY "Authenticated users can create replies"
  ON public.discussion_replies
  FOR INSERT
  WITH CHECK (
    ((SELECT auth.uid()) = created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND (EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
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
    ((SELECT auth.uid()) = created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND (EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
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
    ((SELECT auth.uid()) = created_by)
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
    (SELECT auth.uid()) = user_id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.discussion_subscriptions;
CREATE POLICY "Users can update own subscriptions"
  ON public.discussion_subscriptions
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = user_id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Users can delete own subscriptions" ON public.discussion_subscriptions;
CREATE POLICY "Users can delete own subscriptions"
  ON public.discussion_subscriptions
  FOR DELETE
  USING (
    (SELECT auth.uid()) = user_id
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
    ((SELECT auth.uid()) = created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND (EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
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
    ((SELECT auth.uid()) = created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND (EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
    ))
  );

DROP POLICY IF EXISTS "Users can delete their own discussions" ON public.discussions;
CREATE POLICY "Users can delete their own discussions"
  ON public.discussions
  FOR DELETE
  USING (
    ((SELECT auth.uid()) = created_by)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

-- ============================================================
-- profiles
-- ============================================================

DROP POLICY IF EXISTS "Users can UPDATE their information on their profiles" ON public.profiles;
CREATE POLICY "Users can UPDATE their information on their profiles"
  ON public.profiles
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  )
  WITH CHECK (
    ((SELECT auth.uid()) = id)
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
-- referendum_votes
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can INSERT their own vote" ON public.referendum_votes;
CREATE POLICY "Authenticated users can INSERT their own vote"
  ON public.referendum_votes
  FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND user_id = (SELECT auth.uid())
  );

-- ============================================================
-- referendums
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can INSERT private referendums" ON public.referendums;
CREATE POLICY "Authenticated users can INSERT private referendums"
  ON public.referendums
  FOR INSERT
  WITH CHECK (
    (is_public = false)
    AND (created_by = (SELECT auth.uid()))
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Authenticated users can UPDATE their own referendums" ON public.referendums;
CREATE POLICY "Authenticated users can UPDATE their own referendums"
  ON public.referendums
  FOR UPDATE
  USING (
    created_by = (SELECT auth.uid())
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  )
  WITH CHECK (
    (created_by = (SELECT auth.uid()))
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND (is_public = false)
    AND audit_fields_unchanged(created_at, created_by)
  );

-- ============================================================
-- user_notifications
-- ============================================================

DROP POLICY IF EXISTS "Users can update own notifications" ON public.user_notifications;
CREATE POLICY "Users can update own notifications"
  ON public.user_notifications
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = user_id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.user_notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.user_notifications
  FOR DELETE
  USING (
    (SELECT auth.uid()) = user_id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  );
