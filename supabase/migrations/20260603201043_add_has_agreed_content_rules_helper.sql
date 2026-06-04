-- Introduce a has_agreed_content_rules() helper and thread it through every policy that previously
-- inlined `EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.agreed_content_rules = true)`.
--
-- Why: that subquery was copy-pasted across many content-creation policies, which made it easy to
-- accidentally land it on the wrong policy (it leaked onto the profiles self-update policy and
-- deadlocked onboarding). Centralizing it in a SECURITY DEFINER helper, mirroring is_not_banned()
-- and is_aal2_if_mfa(), makes the gate explicit and harder to misplace.
--
-- This migration is behavior-preserving: each policy keeps identical semantics, only swapping the
-- inline EXISTS for the helper. It intentionally does NOT touch the profiles self-update policy
-- (that gate is removed in a separate migration, since editing your own profile must never be gated
-- on content-rules agreement).

CREATE OR REPLACE FUNCTION public.has_agreed_content_rules()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND agreed_content_rules = true
  );
$$;

-- ============================================================
-- discussion_replies
-- ============================================================

DROP POLICY "Authenticated users can create replies" ON public.discussion_replies;
CREATE POLICY "Authenticated users can create replies"
  ON public.discussion_replies
  FOR INSERT
  TO public
  WITH CHECK (
    (SELECT auth.uid()) = created_by
    AND is_not_banned()
    AND is_aal2_if_mfa()
    AND has_agreed_content_rules()
    AND EXISTS (
      SELECT 1 FROM discussions d
      WHERE d.id = discussion_replies.discussion_id
        AND (d.is_locked = false OR authorize('discussions.update'::app_permission))
    )
  );

DROP POLICY "Authors and discussion owners can update replies" ON public.discussion_replies;
CREATE POLICY "Authors and discussion owners can update replies"
  ON public.discussion_replies
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM discussions d
      WHERE d.id = discussion_replies.discussion_id
        AND d.created_by = (SELECT auth.uid())
    )
    OR (
      (SELECT auth.uid()) = created_by
      AND is_not_banned()
      AND is_aal2_if_mfa()
      AND has_agreed_content_rules()
      AND EXISTS (
        SELECT 1 FROM discussions d
        WHERE d.id = discussion_replies.discussion_id
          AND d.is_locked = false
      )
    )
  );

-- ============================================================
-- discussions
-- ============================================================

DROP POLICY "Authenticated users can create discussions" ON public.discussions;
CREATE POLICY "Authenticated users can create discussions"
  ON public.discussions
  FOR INSERT
  TO public
  WITH CHECK (
    (SELECT auth.uid()) = created_by
    AND is_not_banned()
    AND is_aal2_if_mfa()
    AND has_agreed_content_rules()
    AND (
      (
        discussion_topic_id IS NOT NULL
        AND event_id IS NULL
        AND referendum_id IS NULL
        AND project_id IS NULL
        AND gameserver_id IS NULL
        AND EXISTS (
          SELECT 1 FROM discussion_topics dt
          WHERE dt.id = discussions.discussion_topic_id
            AND (dt.is_locked = false OR authorize('discussions.update'::app_permission))
        )
      )
      OR num_nonnulls(event_id, referendum_id, profile_id, project_id, gameserver_id) > 0
    )
  );

DROP POLICY "Users can update their own discussions" ON public.discussions;
CREATE POLICY "Users can update their own discussions"
  ON public.discussions
  FOR UPDATE
  TO public
  USING (
    (SELECT auth.uid()) = created_by
    AND is_not_banned()
    AND is_aal2_if_mfa()
    AND has_agreed_content_rules()
  );

-- ============================================================
-- events
-- ============================================================

DROP POLICY "Users can INSERT events" ON public.events;
CREATE POLICY "Users can INSERT events"
  ON public.events
  FOR INSERT
  TO public
  WITH CHECK (
    has_permission('events.create'::app_permission)
    OR (
      is_official = false
      AND created_by = (SELECT auth.uid())
      AND is_not_banned()
      AND has_agreed_content_rules()
    )
  );

DROP POLICY "Users can UPDATE events" ON public.events;
CREATE POLICY "Users can UPDATE events"
  ON public.events
  FOR UPDATE
  TO public
  USING (
    has_permission('events.update'::app_permission)
    OR (created_by = (SELECT auth.uid()) AND is_not_banned())
  )
  WITH CHECK (
    (
      has_permission('events.update'::app_permission)
      AND audit_fields_unchanged(created_at, created_by)
    )
    OR (
      created_by = (SELECT auth.uid())
      AND is_official = false
      AND is_not_banned()
      AND audit_fields_unchanged(created_at, created_by)
      AND has_agreed_content_rules()
    )
  );

-- ============================================================
-- network_gameservers
-- ============================================================

DROP POLICY "Allow authorized roles to INSERT gameservers" ON public.network_gameservers;
CREATE POLICY "Allow authorized roles to INSERT gameservers"
  ON public.network_gameservers
  FOR INSERT
  TO public
  WITH CHECK (
    has_permission('network.create'::app_permission)
    AND has_agreed_content_rules()
  );

DROP POLICY "Allow authorized roles to UPDATE gameservers" ON public.network_gameservers;
CREATE POLICY "Allow authorized roles to UPDATE gameservers"
  ON public.network_gameservers
  FOR UPDATE
  TO public
  USING (
    has_permission('network.update'::app_permission)
    AND has_agreed_content_rules()
  );

-- ============================================================
-- projects
-- ============================================================

DROP POLICY "Authorized users can INSERT projects" ON public.projects;
CREATE POLICY "Authorized users can INSERT projects"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    authorize('projects.create'::app_permission)
    AND has_agreed_content_rules()
  );

DROP POLICY "Authorized users can UPDATE projects" ON public.projects;
CREATE POLICY "Authorized users can UPDATE projects"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (
    authorize('projects.update'::app_permission)
    AND has_agreed_content_rules()
  );
