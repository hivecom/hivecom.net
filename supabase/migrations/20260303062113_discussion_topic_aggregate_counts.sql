-- Add pre-computed aggregate counts to discussion_topics so the forum index
-- can read totals directly without fetching every discussion row client-side.
--
-- Chains:
--
--   discussion_replies INSERT/DELETE
--     → discussions.reply_count            (existing trigger, unchanged)
--       → discussion_topics.total_reply_count  (new, via update_topic_aggregate_counts)
--
--   increment_discussion_view_count() RPC
--     → discussions.view_count             (existing RPC, unchanged)
--       → discussion_topics.total_view_count   (new, via update_topic_aggregate_counts)
--
--   discussions INSERT / DELETE / UPDATE OF reply_count, view_count,
--                                            discussion_topic_id, is_draft
--     → discussion_topics.total_reply_count + total_view_count  (recomputed / delta)
--
-- Draft discussions are excluded from all aggregates to match the forum
-- index query filter (.neq('discussions.is_draft', true)).

-- ============================================================
-- 1. Add columns
-- ============================================================

ALTER TABLE public.discussion_topics
  ADD COLUMN total_reply_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN total_view_count  bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.discussion_topics.total_reply_count IS
  'Sum of reply_count across all non-draft discussions in this topic. Maintained by trigger.';

COMMENT ON COLUMN public.discussion_topics.total_view_count IS
  'Sum of view_count across all non-draft discussions in this topic. Maintained by trigger.';

-- ============================================================
-- 2. Backfill from existing data (exclude drafts)
-- ============================================================

UPDATE public.discussion_topics t
SET
  total_reply_count = COALESCE(
    (
      SELECT SUM(d.reply_count)
      FROM public.discussions d
      WHERE d.discussion_topic_id = t.id
        AND d.is_draft = false
    ),
    0
  ),
  total_view_count = COALESCE(
    (
      SELECT SUM(d.view_count)
      FROM public.discussions d
      WHERE d.discussion_topic_id = t.id
        AND d.is_draft = false
    ),
    0
  );

-- ============================================================
-- 3. Update the discussion_topics audit guard to skip the new
--    trigger-maintained columns, matching the pattern established
--    in 20260301015257_forum_last_activity_at.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_discussion_topics_audit_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
DECLARE
  actor     uuid;
  new_payload jsonb;
  old_payload jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Strip all columns that are allowed to change without touching audit fields.
    new_payload := to_jsonb(NEW)
      - 'last_activity_at'
      - 'total_reply_count'
      - 'total_view_count'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';
    old_payload := to_jsonb(OLD)
      - 'last_activity_at'
      - 'total_reply_count'
      - 'total_view_count'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';

    -- Only trigger-driven columns changed – preserve all audit fields as-is.
    IF new_payload = old_payload THEN
      NEW.modified_at = OLD.modified_at;
      NEW.modified_by = OLD.modified_by;
      NEW.created_at  = OLD.created_at;
      NEW.created_by  = OLD.created_by;
      RETURN NEW;
    END IF;

    actor := auth.uid();

    NEW.modified_at = NOW();

    IF actor IS NOT NULL THEN
      NEW.modified_by = actor;
    ELSE
      NEW.modified_by = OLD.modified_by;
    END IF;

    NEW.created_at = OLD.created_at;
    NEW.created_by = OLD.created_by;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- 4. Trigger function: maintain topic aggregate counts
--
--    Strategy:
--      INSERT          – incremental add (fast path)
--      DELETE          – full recompute for the affected topic (safe, avoids
--                        negative counts if reply_count was non-zero at delete)
--      UPDATE
--        re-parent     – full recompute on both old and new topic
--        draft toggle  – full recompute on the affected topic (a discussion's
--                        entire contribution enters or leaves the aggregate)
--        count change  – incremental delta on the affected topic (fast path,
--                        used for every reply insert/delete and every view)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_topic_aggregate_counts()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
DECLARE
  target_topic_id uuid;
BEGIN

  -- ── DELETE ──────────────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    IF OLD.discussion_topic_id IS NOT NULL THEN
      UPDATE public.discussion_topics
      SET
        total_reply_count = COALESCE(
          (SELECT SUM(d.reply_count)
           FROM public.discussions d
           WHERE d.discussion_topic_id = OLD.discussion_topic_id
             AND d.is_draft = false),
          0
        ),
        total_view_count = COALESCE(
          (SELECT SUM(d.view_count)
           FROM public.discussions d
           WHERE d.discussion_topic_id = OLD.discussion_topic_id
             AND d.is_draft = false),
          0
        )
      WHERE id = OLD.discussion_topic_id;
    END IF;
    RETURN NULL;
  END IF;

  -- ── INSERT ──────────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- Drafts do not contribute to the aggregate.
    IF NEW.discussion_topic_id IS NOT NULL AND NEW.is_draft = false THEN
      UPDATE public.discussion_topics
      SET
        total_reply_count = total_reply_count + NEW.reply_count,
        total_view_count  = total_view_count  + NEW.view_count
      WHERE id = NEW.discussion_topic_id;
    END IF;
    RETURN NULL;
  END IF;

  -- ── UPDATE ──────────────────────────────────────────────────────────────

  -- Re-parenting: the discussion moved to a different topic.
  -- Full recompute on the old topic; fall through to update the new one below.
  IF OLD.discussion_topic_id IS DISTINCT FROM NEW.discussion_topic_id
    AND OLD.discussion_topic_id IS NOT NULL
  THEN
    UPDATE public.discussion_topics
    SET
      total_reply_count = COALESCE(
        (SELECT SUM(d.reply_count)
         FROM public.discussions d
         WHERE d.discussion_topic_id = OLD.discussion_topic_id
           AND d.is_draft = false),
        0
      ),
      total_view_count = COALESCE(
        (SELECT SUM(d.view_count)
         FROM public.discussions d
         WHERE d.discussion_topic_id = OLD.discussion_topic_id
           AND d.is_draft = false),
        0
      )
    WHERE id = OLD.discussion_topic_id;
  END IF;

  target_topic_id := NEW.discussion_topic_id;

  IF target_topic_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Draft status toggled: the discussion's full counts either enter or leave
  -- the aggregate, so a full recompute is the safest approach.
  IF OLD.is_draft IS DISTINCT FROM NEW.is_draft THEN
    UPDATE public.discussion_topics
    SET
      total_reply_count = COALESCE(
        (SELECT SUM(d.reply_count)
         FROM public.discussions d
         WHERE d.discussion_topic_id = target_topic_id
           AND d.is_draft = false),
        0
      ),
      total_view_count = COALESCE(
        (SELECT SUM(d.view_count)
         FROM public.discussions d
         WHERE d.discussion_topic_id = target_topic_id
           AND d.is_draft = false),
        0
      )
    WHERE id = target_topic_id;
    RETURN NULL;
  END IF;

  -- Re-parent to a new topic also needs a full recompute on the new topic.
  IF OLD.discussion_topic_id IS DISTINCT FROM NEW.discussion_topic_id THEN
    UPDATE public.discussion_topics
    SET
      total_reply_count = COALESCE(
        (SELECT SUM(d.reply_count)
         FROM public.discussions d
         WHERE d.discussion_topic_id = target_topic_id
           AND d.is_draft = false),
        0
      ),
      total_view_count = COALESCE(
        (SELECT SUM(d.view_count)
         FROM public.discussions d
         WHERE d.discussion_topic_id = target_topic_id
           AND d.is_draft = false),
        0
      )
    WHERE id = target_topic_id;
    RETURN NULL;
  END IF;

  -- Incremental delta for reply_count or view_count changes on a non-draft
  -- discussion.  This is the hot path: every reply posted and every page view
  -- flows through here.
  IF (OLD.reply_count IS DISTINCT FROM NEW.reply_count)
    OR (OLD.view_count IS DISTINCT FROM NEW.view_count)
  THEN
    IF NEW.is_draft = false THEN
      UPDATE public.discussion_topics
      SET
        total_reply_count = total_reply_count + (NEW.reply_count - OLD.reply_count),
        total_view_count  = total_view_count  + (NEW.view_count  - OLD.view_count)
      WHERE id = target_topic_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS update_topic_aggregate_counts_trigger ON public.discussions;

CREATE TRIGGER update_topic_aggregate_counts_trigger
  AFTER INSERT OR DELETE OR UPDATE OF reply_count, view_count, discussion_topic_id, is_draft
  ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_topic_aggregate_counts();

-- ============================================================
-- 5. Grants
-- ============================================================

GRANT EXECUTE ON FUNCTION public.update_topic_aggregate_counts() TO service_role;
