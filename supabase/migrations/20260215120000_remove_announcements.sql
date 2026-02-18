-- Remove announcements table and related structures

-- 1. Modify discussions table to remove dependencies on announcements
-- Drop constraints that reference announcement_id
ALTER TABLE public.discussions DROP CONSTRAINT IF EXISTS discussions_entity_check;
ALTER TABLE public.discussions DROP CONSTRAINT IF EXISTS discussions_title_check;

-- Replace policy that references announcement_id
DROP POLICY IF EXISTS "Authenticated users can create discussions" ON public.discussions;

CREATE POLICY "Authenticated users can create discussions"
  ON public.discussions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by AND
    (
      -- Case 1: Pure Forum Thread (Attached to Topic, No Entity)
      (
         discussion_topic_id IS NOT NULL AND
         event_id IS NULL AND
         referendum_id IS NULL AND
         project_id IS NULL AND
         gameserver_id IS NULL AND
         -- Check Topic Lock
         EXISTS (
            SELECT 1 FROM public.discussion_topics dt
            WHERE dt.id = discussion_topic_id
            AND (dt.is_locked = false OR authorize('discussions.manage'::app_permission))
         )
      )
      OR
      -- Case 2: Entity Attached Discussion (e.g. created by trigger when user makes an entity)
      -- If the user had permission to create the entity, they can create the discussion.
      (
        num_nonnulls(event_id, referendum_id, profile_id, project_id, gameserver_id) > 0
      )
    )
  );

-- Drop the column (this also drops the FK and index)
ALTER TABLE public.discussions DROP COLUMN IF EXISTS announcement_id;

-- Re-add constraints without announcement_id
ALTER TABLE public.discussions
  ADD CONSTRAINT discussions_entity_check CHECK (
    num_nonnulls(
      event_id,
      referendum_id,
      profile_id,
      project_id,
      gameserver_id
    ) <= 1
  );

ALTER TABLE public.discussions
  ADD CONSTRAINT discussions_title_check CHECK (
    (
      num_nonnulls(
        event_id,
        referendum_id,
        profile_id,
        project_id,
        gameserver_id
      ) > 0
    ) OR title IS NOT NULL
  );

-- 2. Drop announcements table
-- This should automatically drop triggers defined on it
DROP TABLE IF EXISTS public.announcements;
