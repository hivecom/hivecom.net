-- Migration: Add source/source_id composite key to notifications + discussion reply fan-out
--
-- 1. Adds `source` and `source_id` columns to the notifications table.
--    Together with `user_id` they form a composite uniqueness key so that
--    the same "thing" only ever produces one notification row per user –
--    subsequent activity upserts (updates) the existing row instead.
--
-- 2. Creates a trigger on `discussion_replies` that fans out notifications
--    to every subscriber of the parent discussion (except the reply author).
--    If an unread notification already exists for that user + discussion it
--    is updated in-place; otherwise a new row is inserted.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.notifications
  ADD COLUMN source text,
  ADD COLUMN source_id text;

COMMENT ON COLUMN public.notifications.source
  IS 'Notification source type, e.g. ''discussion_reply''. Used with source_id for upsert deduplication.';
COMMENT ON COLUMN public.notifications.source_id
  IS 'Source-specific identifier, e.g. a discussion UUID. Used with source for upsert deduplication.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Unique partial index for upsert deduplication
--    Only enforced when both source columns are non-null so legacy /
--    manually-created notifications are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX notifications_user_source_unique_idx
  ON public.notifications (user_id, source, source_id)
  WHERE source IS NOT NULL AND source_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fan-out function
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_discussion_subscribers()
RETURNS TRIGGER AS $$
DECLARE
  v_discussion        record;
  v_author_username   text;
  v_title             text;
  v_body              text;
  v_href              text;
  v_sub               record;
BEGIN
  -- Fetch the parent discussion (we need title + slug for the notification)
  SELECT id, title, slug
    INTO v_discussion
    FROM public.discussions
   WHERE id = NEW.discussion_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Resolve the reply author's username for a friendlier notification body
  SELECT username
    INTO v_author_username
    FROM public.profiles
   WHERE id = NEW.created_by;

  -- Build notification content
  v_title := COALESCE(v_discussion.title, 'Discussion');
  v_body  := COALESCE(v_author_username, 'Someone') || ' posted a new reply';
  v_href  := '/forum/' || COALESCE(v_discussion.slug, v_discussion.id::text);

  -- Fan-out to every subscriber except the reply author.
  -- Use INSERT ... ON CONFLICT to upsert: if an unread notification for
  -- the same (user, source, source_id) already exists we just refresh it.
  FOR v_sub IN
    SELECT user_id
      FROM public.discussion_subscriptions
     WHERE discussion_id = NEW.discussion_id
       AND user_id IS DISTINCT FROM NEW.created_by
  LOOP
    INSERT INTO public.notifications (
      user_id,
      title,
      body,
      href,
      is_read,
      source,
      source_id,
      created_by
    ) VALUES (
      v_sub.user_id,
      v_title,
      v_body,
      v_href,
      false,
      'discussion_reply',
      v_discussion.id::text,
      NEW.created_by
    )
    ON CONFLICT (user_id, source, source_id)
      WHERE source IS NOT NULL AND source_id IS NOT NULL
    DO UPDATE SET
      title       = EXCLUDED.title,
      body        = EXCLUDED.body,
      href        = EXCLUDED.href,
      is_read     = false,
      modified_at = now(),
      modified_by = NEW.created_by;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER notify_discussion_subscribers_on_reply
  AFTER INSERT ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_discussion_subscribers();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants (function is SECURITY DEFINER so it runs as owner, but we still
--    need explicit execute grants for the trigger to fire under authenticated)
-- ─────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.notify_discussion_subscribers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_discussion_subscribers() TO service_role;

COMMIT;
