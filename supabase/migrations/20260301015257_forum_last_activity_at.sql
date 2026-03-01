-- Add last_activity_at to discussions and discussion_topics.
--
-- This replaces the client-side timestamp bubbling logic (getDiscussionLastActivity /
-- getTopicLastActivity) with authoritative, trigger-maintained columns so the
-- frontend can read pre-computed values instead of joining last_reply rows and
-- doing the aggregation itself.
--
-- Chain:
--   discussion_replies INSERT/DELETE
--     → discussions.last_activity_at  (update_discussion_last_activity)
--       → discussion_topics.last_activity_at  (update_topic_last_activity)

-- ============================================================
-- 1. Add columns
-- ============================================================

ALTER TABLE public.discussions
  ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.discussion_topics
  ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now();

-- ============================================================
-- 2. Backfill discussions: max reply created_at, else created_at
-- ============================================================

UPDATE public.discussions d
SET last_activity_at = COALESCE(
  (
    SELECT MAX(r.created_at)
    FROM public.discussion_replies r
    WHERE r.discussion_id = d.id
  ),
  d.created_at
);

-- ============================================================
-- 3. Backfill discussion_topics: max discussion last_activity_at, else created_at
-- ============================================================

UPDATE public.discussion_topics t
SET last_activity_at = COALESCE(
  (
    SELECT MAX(d.last_activity_at)
    FROM public.discussions d
    WHERE d.discussion_topic_id = t.id
  ),
  t.created_at
);

-- ============================================================
-- 4. Indexes for ordering
-- ============================================================

CREATE INDEX discussions_last_activity_at_idx
  ON public.discussions(last_activity_at DESC);

CREATE INDEX discussion_topics_last_activity_at_idx
  ON public.discussion_topics(last_activity_at DESC);

-- ============================================================
-- 5. Guard audit trigger for discussions
--    Extend the existing skip-logic (already skips view_count-only
--    changes) to also skip last_activity_at-only changes so that
--    trigger-driven updates don't corrupt modified_at / modified_by.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_discussions_audit_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
DECLARE
  actor uuid;
  new_payload jsonb;
  old_payload jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Strip all columns that are allowed to change without touching audit fields.
    new_payload := to_jsonb(NEW)
      - 'view_count'
      - 'last_activity_at'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';
    old_payload := to_jsonb(OLD)
      - 'view_count'
      - 'last_activity_at'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';

    -- If the only columns that changed are view_count and/or last_activity_at,
    -- preserve all audit fields exactly as they were.
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

-- Trigger already exists from 20260228080215; replace in place.
DROP TRIGGER IF EXISTS update_discussions_audit_fields ON public.discussions;

CREATE TRIGGER update_discussions_audit_fields
  BEFORE UPDATE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_discussions_audit_fields();

-- ============================================================
-- 6. Guard audit trigger for discussion_topics
--    The original trigger uses the generic update_audit_fields().
--    Replace it with a table-specific version that skips
--    last_activity_at-only changes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_discussion_topics_audit_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
DECLARE
  actor uuid;
  new_payload jsonb;
  old_payload jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    new_payload := to_jsonb(NEW)
      - 'last_activity_at'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';
    old_payload := to_jsonb(OLD)
      - 'last_activity_at'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';

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

-- Replace the generic trigger installed by 20260115184044.
DROP TRIGGER IF EXISTS update_discussion_topics_audit_fields ON public.discussion_topics;

CREATE TRIGGER update_discussion_topics_audit_fields
  BEFORE UPDATE ON public.discussion_topics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_discussion_topics_audit_fields();

-- ============================================================
-- 7. Trigger: reply changes → discussions.last_activity_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_discussion_last_activity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Fast path: only update if the new reply is more recent.
    UPDATE public.discussions
    SET last_activity_at = GREATEST(last_activity_at, NEW.created_at)
    WHERE id = NEW.discussion_id;

  ELSIF TG_OP = 'DELETE' THEN
    -- Slow path: the deleted reply may have been the latest one, so
    -- we must recompute from scratch.
    UPDATE public.discussions
    SET last_activity_at = COALESCE(
      (
        SELECT MAX(r.created_at)
        FROM public.discussion_replies r
        WHERE r.discussion_id = OLD.discussion_id
      ),
      created_at
    )
    WHERE id = OLD.discussion_id;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS update_discussion_last_activity_trigger ON public.discussion_replies;

CREATE TRIGGER update_discussion_last_activity_trigger
  AFTER INSERT OR DELETE ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_discussion_last_activity();

-- ============================================================
-- 8. Trigger: discussion changes → discussion_topics.last_activity_at
--
--    Fires on:
--      INSERT          – new discussion added to a topic
--      DELETE          – discussion removed from a topic
--      UPDATE OF last_activity_at, discussion_topic_id
--                      – activity propagated up, or discussion re-parented
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_topic_last_activity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
BEGIN
  -- When a discussion is re-parented, refresh the old topic too.
  IF TG_OP = 'UPDATE'
    AND OLD.discussion_topic_id IS DISTINCT FROM NEW.discussion_topic_id
    AND OLD.discussion_topic_id IS NOT NULL
  THEN
    UPDATE public.discussion_topics
    SET last_activity_at = COALESCE(
      (
        SELECT MAX(d.last_activity_at)
        FROM public.discussions d
        WHERE d.discussion_topic_id = OLD.discussion_topic_id
      ),
      created_at
    )
    WHERE id = OLD.discussion_topic_id;
  END IF;

  -- Determine target topic for the new/current state.
  DECLARE
    target_topic_id uuid;
  BEGIN
    IF TG_OP = 'DELETE' THEN
      target_topic_id := OLD.discussion_topic_id;
    ELSE
      target_topic_id := NEW.discussion_topic_id;
    END IF;

    IF target_topic_id IS NULL THEN
      RETURN NULL;
    END IF;

    UPDATE public.discussion_topics
    SET last_activity_at = COALESCE(
      (
        SELECT MAX(d.last_activity_at)
        FROM public.discussions d
        WHERE d.discussion_topic_id = target_topic_id
      ),
      created_at
    )
    WHERE id = target_topic_id;
  END;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS update_topic_last_activity_trigger ON public.discussions;

CREATE TRIGGER update_topic_last_activity_trigger
  AFTER INSERT OR DELETE OR UPDATE OF last_activity_at, discussion_topic_id ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_topic_last_activity();

-- ============================================================
-- 9. Grants
-- ============================================================

GRANT EXECUTE ON FUNCTION public.update_discussion_last_activity() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_topic_last_activity() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_discussions_audit_fields() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_discussion_topics_audit_fields() TO service_role;
