-- Replace the FOR...LOOP cursor in notify_discussion_subscribers()
-- with a single set-based INSERT ... SELECT.
--
-- Before: N individual INSERTs inside a PL/pgSQL cursor loop, one per
--         subscriber. Blocks the reply INSERT for the full duration and
--         scales O(n) with subscriber count.
--
-- After:  One INSERT ... SELECT that fans out to all eligible subscribers
--         in a single statement. Postgres executes the ON CONFLICT upsert
--         in bulk. The per-subscriber round-trip overhead is eliminated.
--
-- The notification content (title, body, href) is still computed once in
-- PL/pgSQL before the INSERT, keeping the logic readable. Only the fan-out
-- loop itself is replaced.

CREATE OR REPLACE FUNCTION public.notify_discussion_subscribers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_discussion      record;
  v_author_username text;
  v_title           text;
  v_body            text;
  v_href            text;
BEGIN
  -- Fetch the parent discussion (title + slug for notification content).
  SELECT id, title, slug
    INTO v_discussion
    FROM public.discussions
   WHERE id = NEW.discussion_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Resolve the reply author's username for a friendlier notification body.
  SELECT username
    INTO v_author_username
    FROM public.profiles
   WHERE id = NEW.created_by;

  -- Build notification content once, reused across all subscriber rows.
  v_title := COALESCE(v_discussion.title, 'Discussion');
  v_body  := COALESCE(v_author_username, 'Someone') || ' posted a new reply';
  v_href  := '/forum/' || COALESCE(v_discussion.slug, v_discussion.id::text);

  -- Set-based fan-out: one INSERT covers all subscribers in a single
  -- statement. ON CONFLICT upserts existing unread notifications for the
  -- same (user, source, source_id) rather than creating duplicates.
  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    href,
    is_read,
    source,
    source_id,
    created_by
  )
  SELECT
    ds.user_id,
    v_title,
    v_body,
    v_href,
    false,
    'discussion_reply',
    v_discussion.id::text,
    NEW.created_by
  FROM public.discussion_subscriptions ds
  WHERE ds.discussion_id = NEW.discussion_id
    AND ds.user_id IS DISTINCT FROM NEW.created_by
  ON CONFLICT (user_id, source, source_id)
    WHERE source IS NOT NULL AND source_id IS NOT NULL
  DO UPDATE SET
    title       = EXCLUDED.title,
    body        = EXCLUDED.body,
    href        = EXCLUDED.href,
    is_read     = false,
    modified_at = now(),
    modified_by = NEW.created_by;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_discussion_subscribers() IS
  'Fans out reply notifications to all discussion subscribers. '
  'Uses a single set-based INSERT ... SELECT instead of a cursor loop, '
  'so N subscribers cost one statement rather than N round-trips.';

-- Trigger definition is unchanged - recreating it here to ensure it stays
-- attached after the function replacement above.
DROP TRIGGER IF EXISTS notify_discussion_subscribers_on_reply ON public.discussion_replies;

CREATE TRIGGER notify_discussion_subscribers_on_reply
  AFTER INSERT ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_discussion_subscribers();

-- Grants (SECURITY DEFINER runs as owner, but explicit grants are conventional).
GRANT EXECUTE ON FUNCTION public.notify_discussion_subscribers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_discussion_subscribers() TO service_role;
