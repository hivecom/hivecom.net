-- Replace the full SUM() recompute in update_topic_aggregate_counts()
-- DELETE path with an incremental delta approach.
--
-- Before: DELETE fires two subquery aggregates (SUM reply_count, SUM view_count)
--         across all discussions in the topic - a full scan on every reply
--         deletion or discussion delete.
--
-- After:  DELETE subtracts OLD.reply_count / OLD.view_count directly from the
--         topic totals (same pattern already used in the INSERT fast path, just
--         negated). A GREATEST(..., 0) guard prevents the totals going negative
--         in the event of data inconsistency.
--
-- The re-parent and draft-toggle paths on UPDATE are left as full recomputes
-- because those are low-frequency operations where correctness matters more
-- than speed, and the delta math is non-trivial (two topics involved).
--
-- The INSERT and UPDATE incremental paths are unchanged.

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
  -- #190: delta subtraction instead of full SUM() recompute.
  -- GREATEST(..., 0) guards against going negative if counts are somehow
  -- already inconsistent - better to clamp than to store a negative total.
  IF TG_OP = 'DELETE' THEN
    IF OLD.discussion_topic_id IS NOT NULL AND OLD.is_draft = false THEN
      UPDATE public.discussion_topics
      SET
        total_reply_count = GREATEST(total_reply_count - OLD.reply_count, 0),
        total_view_count  = GREATEST(total_view_count  - OLD.view_count,  0)
      WHERE id = OLD.discussion_topic_id;
    END IF;
    -- Draft discussions never contributed to the aggregate, so no update needed.
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
  -- Full recompute on the old topic is unavoidable (we don't know what
  -- the remaining discussions sum to without querying). Fall through to
  -- update the new topic below.
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

  -- Draft status toggled: the discussion's full counts enter or leave the
  -- aggregate. Full recompute is the safest approach here - this path is
  -- infrequent and the delta math requires knowing the current totals
  -- including this row, which is ambiguous mid-trigger.
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

  -- Re-parent to a new topic needs a full recompute on the new topic as
  -- well, since the discussion's counts are being added for the first time.
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
  -- discussion. This is the hot path: every reply posted and every page view
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

COMMENT ON FUNCTION public.update_topic_aggregate_counts() IS
  'Maintains total_reply_count and total_view_count on discussion_topics. '
  'INSERT and DELETE use incremental deltas (O(1)). UPDATE uses deltas for '
  'count changes and full recomputes only for re-parent and draft-toggle '
  'paths, which are low-frequency.';

DROP TRIGGER IF EXISTS update_topic_aggregate_counts_trigger ON public.discussions;

CREATE TRIGGER update_topic_aggregate_counts_trigger
  AFTER INSERT OR DELETE OR UPDATE OF reply_count, view_count, discussion_topic_id, is_draft
  ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_topic_aggregate_counts();

GRANT EXECUTE ON FUNCTION public.update_topic_aggregate_counts() TO service_role;
