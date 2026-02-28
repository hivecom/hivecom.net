-- Require content rules agreement for markdown insert policies

-- Helper check: user must have agreed to content rules
-- (inline EXISTS used in each policy)

-- Discussions: require agreement to create
DROP POLICY IF EXISTS "Authenticated users can create discussions" ON public.discussions;
CREATE POLICY "Authenticated users can create discussions"
  ON public.discussions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
    AND (
      (
        discussion_topic_id IS NOT NULL
        AND event_id IS NULL
        AND referendum_id IS NULL
        AND project_id IS NULL
        AND gameserver_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.discussion_topics dt
          WHERE dt.id = discussion_topic_id
            AND (dt.is_locked = false OR authorize('discussions.update'::public.app_permission))
        )
      )
      OR
      (
        num_nonnulls(event_id, referendum_id, profile_id, project_id, gameserver_id) > 0
      )
    )
  );

-- Discussion replies: require agreement to create
DROP POLICY IF EXISTS "Authenticated users can create replies" ON public.discussion_replies;
CREATE POLICY "Authenticated users can create replies"
  ON public.discussion_replies FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
    AND EXISTS (
      SELECT 1 FROM public.discussions d
      WHERE d.id = discussion_id
        AND (d.is_locked = false OR authorize('discussions.update'::public.app_permission))
    )
  );

-- Events: require agreement to create
DROP POLICY IF EXISTS "Allow authorized roles to INSERT events" ON public.events;
CREATE POLICY "Allow authorized roles to INSERT events" ON public.events AS permissive
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('events.create'::public.app_permission)
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

-- Gameservers: require agreement to create
DROP POLICY IF EXISTS "Allow authorized roles to INSERT gameservers" ON public.gameservers;
CREATE POLICY "Allow authorized roles to INSERT gameservers" ON public.gameservers AS permissive
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('gameservers.create'::public.app_permission)
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

-- Projects: require agreement to create
DROP POLICY IF EXISTS "projects_insert_policy" ON public.projects;
CREATE POLICY "projects_insert_policy" ON public.projects AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    authorize('projects.create'::public.app_permission)
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

-- Require agreement to update markdown-bearing content
DROP POLICY IF EXISTS "Users can update their own discussions" ON public.discussions;
CREATE POLICY "Users can update their own discussions"
  ON public.discussions FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

DROP POLICY IF EXISTS "Moderators can update any discussion" ON public.discussions;
CREATE POLICY "Allow authorized can update any discussion"
  ON public.discussions FOR UPDATE
  TO authenticated
  USING (
    authorize('discussions.update'::public.app_permission)
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

DROP POLICY IF EXISTS "Users can update their own replies" ON public.discussion_replies;
CREATE POLICY "Users can update their own replies"
  ON public.discussion_replies FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

DROP POLICY IF EXISTS "Moderators can update any reply" ON public.discussion_replies;
CREATE POLICY "Allow authorized can update any reply"
  ON public.discussion_replies FOR UPDATE
  TO authenticated
  USING (
    authorize('discussions.update'::public.app_permission)
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE events" ON public.events;
CREATE POLICY "Allow authorized roles to UPDATE events" ON public.events AS permissive
  FOR UPDATE TO authenticated
  USING (
    public.has_permission('events.update'::public.app_permission)
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE gameservers" ON public.gameservers;
CREATE POLICY "Allow authorized roles to UPDATE gameservers" ON public.gameservers AS permissive
  FOR UPDATE TO authenticated
  USING (
    public.has_permission('gameservers.update'::public.app_permission)
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

DROP POLICY IF EXISTS "projects_update_policy" ON public.projects;
CREATE POLICY "projects_update_policy" ON public.projects AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (
    authorize('projects.update'::public.app_permission)
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

-- Profiles: require agreement to update
DROP POLICY IF EXISTS "Allow authorized roles to UPDATE profiles" ON public.profiles;
CREATE POLICY "Allow authorized roles to UPDATE profiles" ON public.profiles AS permissive
  FOR UPDATE TO authenticated
  USING (
    (public.has_permission('profiles.update'::public.app_permission) OR public.is_profile_owner(id))
  )
  WITH CHECK (
    (public.has_permission('profiles.update'::public.app_permission) OR public.is_profile_owner(id))
    AND (
      public.has_permission('users.update'::public.app_permission)
      OR (
        public.is_profile_owner(id)
        AND created_at IS NOT DISTINCT FROM created_at
        AND modified_at IS NOT DISTINCT FROM modified_at
        AND modified_by IS NOT DISTINCT FROM modified_by
        AND discord_id IS NOT DISTINCT FROM discord_id
        AND patreon_id IS NOT DISTINCT FROM patreon_id
        AND steam_id IS NOT DISTINCT FROM steam_id
        AND supporter_patreon IS NOT DISTINCT FROM supporter_patreon
        AND supporter_lifetime IS NOT DISTINCT FROM supporter_lifetime
        AND banned IS NOT DISTINCT FROM banned
        AND ban_reason IS NOT DISTINCT FROM ban_reason
        AND ban_start IS NOT DISTINCT FROM ban_start
        AND ban_end IS NOT DISTINCT FROM ban_end
      )
    )
    AND (
      (SELECT p.markdown FROM public.profiles p WHERE p.id = id) IS NOT DISTINCT FROM markdown
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.agreed_content_rules = true
      )
    )
  );

DROP POLICY IF EXISTS "Allow admins to manage user bans" ON public.profiles;
CREATE POLICY "Allow admins to manage user bans" ON public.profiles AS permissive
  FOR UPDATE TO authenticated
  USING (
    public.has_permission('users.update'::public.app_permission)
  )
  WITH CHECK (
    public.has_permission('users.update'::public.app_permission)
    AND public.audit_fields_unchanged(created_at, NULL)
  );
