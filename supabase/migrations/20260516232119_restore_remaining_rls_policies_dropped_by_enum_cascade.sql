-- Restore RLS policies silently dropped by DROP TYPE ... CASCADE in
-- 20260515164827_consolidate_permissions_step2_migrate_and_cleanup.sql
-- that were not caught by the original restore migration (20260515164828)
-- or the complaints restore (20260516032000).
--
-- Affected policies:
--   1. "Authenticated users can create discussions"  ON public.discussions
--      (20260401183439_ban_and_aal_rls_enforcement.sql)
--   2. "Users can create discussion topics"          ON public.discussion_topics
--      (20260226000000_recreate_app_permission_enum.sql)
--   2b. "Users can update discussion topics"          ON public.discussion_topics
--      (20260226000000_recreate_app_permission_enum.sql)
--   2c. "Users can delete discussion topics"          ON public.discussion_topics
--      (20260226000000_recreate_app_permission_enum.sql)
--   3. "Authorized users can UPDATE votes"           ON public.referendum_votes
--      (20260401183439_ban_and_aal_rls_enforcement.sql)
--   4. "Authorized users can DELETE votes"           ON public.referendum_votes
--      (20260401183439_ban_and_aal_rls_enforcement.sql)
--   5. "Admins can INSERT events"                    ON public.events
--      (20260426043223_events_official_and_recurrence.sql)
--   6. "Admins can UPDATE events"                    ON public.events
--      (20260426043223_events_official_and_recurrence.sql)
--   7. "Admins can DELETE events"                    ON public.events
--      (20260426043223_events_official_and_recurrence.sql)
--   8. "Only admins can set is_official on events"   ON public.events  (INSERT guard)
--      (20260429141909_fix_events_rls_policies.sql)
--   9. "Only admins can update is_official on events" ON public.events (UPDATE guard)
--      (20260429141909_fix_events_rls_policies.sql)
--  10. "Allow authorized roles to DELETE user avatars in storage" ON storage.objects
--      (20260424043048_storage_policy_avatar_gif.sql)

-- ─── 1. discussions INSERT ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can create discussions" ON public.discussions;

CREATE POLICY "Authenticated users can create discussions"
  ON public.discussions
  FOR INSERT
  WITH CHECK (
    (auth.uid() = created_by)
    AND public.is_not_banned()
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
            AND (dt.is_locked = false OR public.authorize('discussions.update'::public.app_permission))
        ))
      )
      OR num_nonnulls(event_id, referendum_id, profile_id, project_id, gameserver_id) > 0
    )
  );

-- ─── 2. discussion_topics INSERT / UPDATE / DELETE ──────────────────────────

DROP POLICY IF EXISTS "Users can create discussion topics" ON public.discussion_topics;

CREATE POLICY "Users can create discussion topics"
  ON public.discussion_topics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.authorize('discussion_topics.create'::public.app_permission)
  );

DROP POLICY IF EXISTS "Users can update discussion topics" ON public.discussion_topics;

CREATE POLICY "Users can update discussion topics"
  ON public.discussion_topics
  FOR UPDATE
  TO authenticated
  USING (
    public.authorize('discussion_topics.update'::public.app_permission)
  )
  WITH CHECK (
    public.authorize('discussion_topics.update'::public.app_permission)
  );

DROP POLICY IF EXISTS "Users can delete discussion topics" ON public.discussion_topics;

CREATE POLICY "Users can delete discussion topics"
  ON public.discussion_topics
  FOR DELETE
  TO authenticated
  USING (
    public.authorize('discussion_topics.delete'::public.app_permission)
  );

-- ─── 3 & 4. referendum_votes UPDATE / DELETE ──────────────────────────────────

DROP POLICY IF EXISTS "Authorized users can UPDATE votes" ON public.referendum_votes;

CREATE POLICY "Authorized users can UPDATE votes"
  ON public.referendum_votes
  FOR UPDATE
  USING (
    (public.has_permission('referendums.update'::public.app_permission) OR public.is_owner(user_id))
    AND public.is_not_banned()
  )
  WITH CHECK (
    (public.has_permission('referendums.update'::public.app_permission) OR public.is_owner(user_id))
    AND public.is_not_banned()
  );

DROP POLICY IF EXISTS "Authorized users can DELETE votes" ON public.referendum_votes;

CREATE POLICY "Authorized users can DELETE votes"
  ON public.referendum_votes
  FOR DELETE
  USING (
    (public.has_permission('referendums.delete'::public.app_permission) OR public.is_owner(user_id))
    AND public.is_not_banned()
  );

-- ─── 5-7. events admin INSERT / UPDATE / DELETE ───────────────────────────────

DROP POLICY IF EXISTS "Admins can INSERT events" ON public.events;

CREATE POLICY "Admins can INSERT events"
  ON public.events
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission('events.create'::public.app_permission));

DROP POLICY IF EXISTS "Admins can UPDATE events" ON public.events;

CREATE POLICY "Admins can UPDATE events"
  ON public.events
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (public.has_permission('events.update'::public.app_permission))
  WITH CHECK (
    public.has_permission('events.update'::public.app_permission)
    AND public.audit_fields_unchanged(created_at, created_by)
  );

DROP POLICY IF EXISTS "Admins can DELETE events" ON public.events;

CREATE POLICY "Admins can DELETE events"
  ON public.events
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (public.has_permission('events.delete'::public.app_permission));

-- ─── 8 & 9. events is_official guards ────────────────────────────────────────

DROP POLICY IF EXISTS "Only admins can set is_official on events" ON public.events;

CREATE POLICY "Only admins can set is_official on events"
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE
      WHEN is_official THEN public.has_permission('events.create'::public.app_permission)
      ELSE true
    END
  );

DROP POLICY IF EXISTS "Only admins can update is_official on events" ON public.events;

CREATE POLICY "Only admins can update is_official on events"
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    CASE
      WHEN is_official THEN (public.has_permission('events.update'::public.app_permission) OR created_by = auth.uid())
      ELSE true
    END
  )
  WITH CHECK (
    CASE
      WHEN is_official THEN public.has_permission('events.update'::public.app_permission)
      ELSE true
    END
  );

-- ─── 10. storage avatar admin DELETE ─────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to DELETE user avatars in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to DELETE user avatars in storage"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'hivecom-content-users'
    AND (
      name LIKE '%/avatar.webp'
      OR name LIKE '%/avatar.gif'
      OR name LIKE '%/avatar.png'
      OR name LIKE '%/avatar.jpg'
      OR name LIKE '%/avatar.jpeg'
    )
    AND public.has_permission('profiles.delete'::public.app_permission)
  );
