-- Fix unqualified authorize() calls in discussions RLS policies.
--
-- Problem:
--   Four RLS policies on public.discussions call authorize(...) without the
--   public. schema qualifier. When Supabase/PostgREST runs with search_path = ''
--   (which production now enforces), the unqualified name cannot be resolved,
--   producing:
--
--     ERROR 42883: function authorize(public.app_permission) does not exist
--
--   This surfaces as a 404 on any POST/PATCH to /rest/v1/discussions?select=*
--   because PostgREST evaluates RLS policies against the returned rows after
--   the write completes.
--
-- Affected policies:
--   - "Everyone can view discussions"              (SELECT)
--   - "Moderators can delete any discussion"       (DELETE)
--   - "Authenticated users can create discussions" (INSERT)
--   - "Allow authorized can update any discussion" (UPDATE)
--
-- Fix:
--   Drop and recreate each policy with fully-qualified public.authorize() and
--   public.app_permission references.

-- SELECT
DROP POLICY IF EXISTS "Everyone can view discussions" ON public.discussions;
CREATE POLICY "Everyone can view discussions"
  ON public.discussions FOR SELECT
  USING (
    -- Admins and moderators can always see everything (drafts, NSFW, etc.)
    public.authorize('discussions.update'::public.app_permission)
    -- Authors can always see their own discussions regardless of state
    OR auth.uid() = created_by
    -- Everyone else can only see non-draft, non-NSFW discussions
    OR (is_draft = false AND is_nsfw = false)
  );

-- DELETE
DROP POLICY IF EXISTS "Moderators can delete any discussion" ON public.discussions;
CREATE POLICY "Moderators can delete any discussion"
  ON public.discussions FOR DELETE
  TO authenticated
  USING (
    public.authorize('discussions.delete'::public.app_permission)
  );

-- INSERT
DROP POLICY IF EXISTS "Authenticated users can create discussions" ON public.discussions;
CREATE POLICY "Authenticated users can create discussions"
  ON public.discussions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.profiles p
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
            AND (dt.is_locked = false OR public.authorize('discussions.update'::public.app_permission))
        )
      )
      OR num_nonnulls(event_id, referendum_id, profile_id, project_id, gameserver_id) > 0
    )
  );

-- UPDATE
DROP POLICY IF EXISTS "Allow authorized can update any discussion" ON public.discussions;
CREATE POLICY "Allow authorized can update any discussion"
  ON public.discussions FOR UPDATE
  TO authenticated
  USING (
    public.authorize('discussions.update'::public.app_permission)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );
