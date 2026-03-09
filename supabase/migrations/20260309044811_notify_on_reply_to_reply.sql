-- Migration: Notify a user when someone replies directly to their discussion reply
--
-- When a reply has a non-null reply_to_id, look up the original reply's author
-- and send them a notification — unless the replier is the same person.
--
-- Deduplication key:
--   source     = 'discussion_reply_reply'
--   source_id  = <reply_to_id>   (the original reply being responded to)
--
-- This means if someone receives multiple responses to the same reply while
-- the notification is still unread, it updates in-place rather than stacking.

CREATE OR REPLACE FUNCTION public.notify_reply_to_reply_author()
RETURNS TRIGGER AS $$
DECLARE
  v_discussion      record;
  v_original_reply  record;
  v_author_name     text;
  v_title           text;
  v_body            text;
  v_href            text;
BEGIN
  -- Only relevant when this reply is responding to another reply
  IF NEW.reply_to_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fetch the original reply and its author
  SELECT id, created_by, discussion_id
    INTO v_original_reply
    FROM public.discussion_replies
   WHERE id = NEW.reply_to_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Don't notify if the replier is the original reply's author
  IF v_original_reply.created_by IS NULL
     OR v_original_reply.created_by = NEW.created_by THEN
    RETURN NEW;
  END IF;

  -- Fetch the parent discussion for title + slug
  SELECT id, title, slug
    INTO v_discussion
    FROM public.discussions
   WHERE id = NEW.discussion_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Resolve the replier's username
  SELECT username
    INTO v_author_name
    FROM public.profiles
   WHERE id = NEW.created_by;

  -- Build notification content
  v_title := COALESCE(v_author_name, 'Someone') || ' replied to your comment';
  v_body  := 'In ' || COALESCE(v_discussion.title, 'a discussion');
  v_href  := '/forum/' || COALESCE(v_discussion.slug, v_discussion.id::text);

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
    v_original_reply.created_by,
    v_title,
    v_body,
    v_href,
    false,
    'discussion_reply_reply',
    NEW.reply_to_id::text,
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER notify_reply_to_reply_author_on_reply
  AFTER INSERT ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_reply_to_reply_author();

GRANT EXECUTE ON FUNCTION public.notify_reply_to_reply_author() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_reply_to_reply_author() TO service_role;
