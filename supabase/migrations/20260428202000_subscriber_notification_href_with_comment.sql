-- Bake the triggering reply ID into the notification href as ?comment=<id>
-- so clicking navigates directly to that reply.
-- source_id stays as discussion.id for dedup (multiple replies collapse into one notification).

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
  SELECT id, title, slug
    INTO v_discussion
    FROM public.discussions
   WHERE id = NEW.discussion_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT username
    INTO v_author_username
    FROM public.profiles
   WHERE id = NEW.created_by;

  v_title := COALESCE(v_discussion.title, 'Discussion');
  v_body  := COALESCE(v_author_username, 'Someone') || ' posted a new reply';
  -- Append ?comment=<reply_id> so the front-end deep-links to the specific reply.
  -- source_id remains the discussion id for dedup, so repeated replies collapse
  -- into one notification that always points to the latest triggering reply.
  v_href  := '/forum/' || COALESCE(v_discussion.slug, v_discussion.id::text)
             || '?comment=' || NEW.id::text;

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
  'Uses a single set-based INSERT ... SELECT instead of a cursor loop. '
  'source_id = discussion.id for dedup; href includes ?comment=<reply_id> '
  'so the front-end deep-links to the specific reply.';

DROP TRIGGER IF EXISTS notify_discussion_subscribers_on_reply ON public.discussion_replies;
CREATE TRIGGER notify_discussion_subscribers_on_reply
  AFTER INSERT ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_discussion_subscribers();

GRANT EXECUTE ON FUNCTION public.notify_discussion_subscribers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_discussion_subscribers() TO service_role;
