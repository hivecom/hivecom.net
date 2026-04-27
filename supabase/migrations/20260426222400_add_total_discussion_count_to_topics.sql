-- Add total_discussion_count to discussion_topics, maintained by the existing
-- update_topic_aggregate_counts trigger (replaced below).

ALTER TABLE public.discussion_topics
  ADD COLUMN total_discussion_count bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.discussion_topics.total_discussion_count IS
  'Count of non-draft discussions in this topic. Maintained by trigger.';

-- Backfill from current data
UPDATE public.discussion_topics t
SET total_discussion_count = COALESCE(
  (SELECT COUNT(*) FROM public.discussions d
   WHERE d.discussion_topic_id = t.id AND d.is_draft = false),
  0
);

-- Replace the trigger function to also maintain total_discussion_count
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
    IF OLD.discussion_topic_id IS NOT NULL AND OLD.is_draft = false THEN
      UPDATE public.discussion_topics
      SET
        total_reply_count      = GREATEST(total_reply_count - OLD.reply_count, 0),
        total_view_count       = GREATEST(total_view_count  - OLD.view_count,  0),
        total_discussion_count = GREATEST(total_discussion_count - 1, 0)
      WHERE id = OLD.discussion_topic_id;
    END IF;
    RETURN NULL;
  END IF;

  -- ── INSERT ──────────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    IF NEW.discussion_topic_id IS NOT NULL AND NEW.is_draft = false THEN
      UPDATE public.discussion_topics
      SET
        total_reply_count      = total_reply_count + NEW.reply_count,
        total_view_count       = total_view_count  + NEW.view_count,
        total_discussion_count = total_discussion_count + 1
      WHERE id = NEW.discussion_topic_id;
    END IF;
    RETURN NULL;
  END IF;

  -- ── UPDATE ──────────────────────────────────────────────────────────────

  -- Re-parenting: full recompute on old topic
  IF OLD.discussion_topic_id IS DISTINCT FROM NEW.discussion_topic_id
    AND OLD.discussion_topic_id IS NOT NULL
  THEN
    UPDATE public.discussion_topics
    SET
      total_reply_count = COALESCE(
        (SELECT SUM(d.reply_count) FROM public.discussions d
         WHERE d.discussion_topic_id = OLD.discussion_topic_id AND d.is_draft = false), 0),
      total_view_count = COALESCE(
        (SELECT SUM(d.view_count) FROM public.discussions d
         WHERE d.discussion_topic_id = OLD.discussion_topic_id AND d.is_draft = false), 0),
      total_discussion_count = COALESCE(
        (SELECT COUNT(*) FROM public.discussions d
         WHERE d.discussion_topic_id = OLD.discussion_topic_id AND d.is_draft = false), 0)
    WHERE id = OLD.discussion_topic_id;
  END IF;

  target_topic_id := NEW.discussion_topic_id;

  IF target_topic_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Draft status toggled: full recompute
  IF OLD.is_draft IS DISTINCT FROM NEW.is_draft THEN
    UPDATE public.discussion_topics
    SET
      total_reply_count = COALESCE(
        (SELECT SUM(d.reply_count) FROM public.discussions d
         WHERE d.discussion_topic_id = target_topic_id AND d.is_draft = false), 0),
      total_view_count = COALESCE(
        (SELECT SUM(d.view_count) FROM public.discussions d
         WHERE d.discussion_topic_id = target_topic_id AND d.is_draft = false), 0),
      total_discussion_count = COALESCE(
        (SELECT COUNT(*) FROM public.discussions d
         WHERE d.discussion_topic_id = target_topic_id AND d.is_draft = false), 0)
    WHERE id = target_topic_id;
    RETURN NULL;
  END IF;

  -- Re-parent to new topic: full recompute on new topic
  IF OLD.discussion_topic_id IS DISTINCT FROM NEW.discussion_topic_id THEN
    UPDATE public.discussion_topics
    SET
      total_reply_count = COALESCE(
        (SELECT SUM(d.reply_count) FROM public.discussions d
         WHERE d.discussion_topic_id = target_topic_id AND d.is_draft = false), 0),
      total_view_count = COALESCE(
        (SELECT SUM(d.view_count) FROM public.discussions d
         WHERE d.discussion_topic_id = target_topic_id AND d.is_draft = false), 0),
      total_discussion_count = COALESCE(
        (SELECT COUNT(*) FROM public.discussions d
         WHERE d.discussion_topic_id = target_topic_id AND d.is_draft = false), 0)
    WHERE id = target_topic_id;
    RETURN NULL;
  END IF;

  -- Incremental delta for reply_count / view_count changes (hot path).
  -- total_discussion_count does not change here - no insert/delete occurred.
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
  'Maintains total_reply_count, total_view_count, and total_discussion_count on discussion_topics. '
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
