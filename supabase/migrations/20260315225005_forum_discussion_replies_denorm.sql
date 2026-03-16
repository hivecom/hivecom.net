-- Eliminate the implicit JOIN on every forum_discussion_replies query
-- by denormalizing is_forum_reply onto discussion_replies.
--
-- Before: the view does INNER JOIN discussions ON discussions.id = dr.discussion_id
--         WHERE discussions.discussion_topic_id IS NOT NULL. Every SELECT against
--         the view incurs this join even when the caller only needs reply columns.
--
-- After:  a boolean column is_forum_reply is maintained by trigger on
--         discussion_replies. The view becomes WHERE is_forum_reply = true with
--         a partial index - no join, index-only scan on the partial index.
--
-- Migration steps:
--   1. Add is_forum_reply boolean NOT NULL DEFAULT false to discussion_replies.
--   2. Backfill existing rows via a JOIN to discussions.
--   3. Create a trigger function that keeps is_forum_reply in sync when:
--        - A reply is inserted (look up the parent discussion's topic).
--        - A discussion's discussion_topic_id changes (UPDATE the affected replies).
--   4. Create the triggers on discussion_replies (INSERT) and discussions (UPDATE).
--   5. Recreate the forum_discussion_replies view using the new column.
--   6. Add a partial index on discussion_replies(is_forum_reply) for fast scans.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New column
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.discussion_replies
  ADD COLUMN IF NOT EXISTS is_forum_reply boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.discussion_replies.is_forum_reply IS
  'Denormalized flag: true when the parent discussion has a non-null '
  'discussion_topic_id (i.e. it belongs to a forum topic). Maintained by '
  'trigger. Eliminates the JOIN to discussions in forum_discussion_replies.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill existing rows
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.discussion_replies dr
SET is_forum_reply = true
FROM public.discussions d
WHERE d.id = dr.discussion_id
  AND d.discussion_topic_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3a. Trigger function: set is_forum_reply on new replies
--     Fires AFTER INSERT ON discussion_replies.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_reply_is_forum_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_topic_id uuid;
BEGIN
  SELECT discussion_topic_id
    INTO v_topic_id
    FROM public.discussions
   WHERE id = NEW.discussion_id;

  IF v_topic_id IS NOT NULL THEN
    NEW.is_forum_reply := true;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_reply_is_forum_reply() IS
  'BEFORE INSERT trigger on discussion_replies. Sets is_forum_reply = true '
  'when the parent discussion belongs to a forum topic.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. Trigger function: propagate is_forum_reply when a discussion is
--     re-parented (discussion_topic_id changes).
--     Fires AFTER UPDATE OF discussion_topic_id ON discussions.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_replies_is_forum_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Only act when discussion_topic_id actually changed.
  IF OLD.discussion_topic_id IS NOT DISTINCT FROM NEW.discussion_topic_id THEN
    RETURN NEW;
  END IF;

  UPDATE public.discussion_replies
  SET is_forum_reply = (NEW.discussion_topic_id IS NOT NULL)
  WHERE discussion_id = NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_replies_is_forum_reply() IS
  'AFTER UPDATE trigger on discussions. When a discussion is re-parented '
  '(discussion_topic_id changes), updates is_forum_reply on all its replies '
  'to stay consistent with the new parent state.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Attach triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- BEFORE INSERT so we can set the column on NEW before it is stored.
DROP TRIGGER IF EXISTS set_reply_is_forum_reply_trigger ON public.discussion_replies;

CREATE TRIGGER set_reply_is_forum_reply_trigger
  BEFORE INSERT ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_reply_is_forum_reply();

-- AFTER UPDATE on discussions for the re-parent case.
DROP TRIGGER IF EXISTS sync_replies_is_forum_reply_trigger ON public.discussions;

CREATE TRIGGER sync_replies_is_forum_reply_trigger
  AFTER UPDATE OF discussion_topic_id ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_replies_is_forum_reply();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Recreate the view - no join, just the partial filter
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.forum_discussion_replies;

CREATE VIEW public.forum_discussion_replies
  WITH (security_invoker = true)
AS
SELECT dr.*
FROM public.discussion_replies dr
WHERE dr.is_forum_reply = true;

COMMENT ON VIEW public.forum_discussion_replies IS
  'discussion_replies scoped to forum discussions (is_forum_reply = true). '
  'Uses the denormalized is_forum_reply column maintained by trigger - no JOIN '
  'to discussions required. RLS is inherited from the underlying table.';

GRANT SELECT ON public.forum_discussion_replies TO anon;
GRANT SELECT ON public.forum_discussion_replies TO authenticated;
GRANT SELECT ON public.forum_discussion_replies TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Partial index to make the view's WHERE clause an index-only scan
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_discussion_replies_is_forum_reply
  ON public.discussion_replies (created_at DESC)
  WHERE is_forum_reply = true;

COMMENT ON INDEX public.idx_discussion_replies_is_forum_reply IS
  'Partial index covering only forum replies. Powers the forum activity feed '
  'ORDER BY created_at DESC scan without touching non-forum reply rows.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.set_reply_is_forum_reply() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_replies_is_forum_reply() TO service_role;
