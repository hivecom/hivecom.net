-- Migration: update reply-to-reply notification title wording
--
-- Changes "replied to your comment" -> "replied to you" in both:
--   1. The trigger function (for future notifications)
--   2. Existing stored notification rows (backfill)

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
  v_title := COALESCE(v_author_name, 'Someone') || ' replied to you';
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

-- Backfill: update existing unread rows that still carry the old wording.
-- Only touches rows where the suffix matches exactly so a manual override
-- (e.g. a custom title) is left alone.
UPDATE public.notifications
   SET title = regexp_replace(title, ' replied to your comment$', ' replied to you')
 WHERE source = 'discussion_reply_reply'
   AND title LIKE '% replied to your comment';
