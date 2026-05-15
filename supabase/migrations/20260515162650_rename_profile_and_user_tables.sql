-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rename tables
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.friends       RENAME TO profile_friends;
ALTER TABLE public.settings      RENAME TO user_settings;
ALTER TABLE public.notifications RENAME TO user_notifications;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. trigger_notify_discussion_subscribers
--    Replaces: notify_discussion_subscribers
--    Table:    discussion_replies (AFTER INSERT)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_notify_discussion_subscribers()
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
  v_href  := '/forum/' || COALESCE(v_discussion.slug, v_discussion.id::text)
             || '?comment=' || NEW.id::text;

  INSERT INTO public.user_notifications (
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

COMMENT ON FUNCTION public.trigger_notify_discussion_subscribers() IS
  'Fans out reply notifications to all discussion subscribers. '
  'Uses a single set-based INSERT ... SELECT instead of a cursor loop. '
  'source_id = discussion.id for dedup; href includes ?comment=<reply_id> '
  'so the front-end deep-links to the specific reply.';

DROP TRIGGER IF EXISTS notify_discussion_subscribers_on_reply ON public.discussion_replies;
CREATE TRIGGER notify_discussion_subscribers_on_reply
  AFTER INSERT ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_notify_discussion_subscribers();

GRANT EXECUTE ON FUNCTION public.trigger_notify_discussion_subscribers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_notify_discussion_subscribers() TO service_role;

DROP FUNCTION IF EXISTS public.notify_discussion_subscribers();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. trigger_notify_mentioned_users
--    Replaces: notify_mentioned_users
--    Table:    discussion_replies (AFTER INSERT)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_notify_mentioned_users()
RETURNS TRIGGER
SECURITY DEFINER
AS $$
DECLARE
  v_discussion   record;
  v_author_name  text;
  v_title        text;
  v_body         text;
  v_href         text;
  v_mentioned_id uuid;
BEGIN
  IF NEW.markdown IS NULL OR NEW.markdown = '' THEN
    RETURN NEW;
  END IF;

  SELECT id, title, slug
    INTO v_discussion
    FROM public.discussions
   WHERE id = NEW.discussion_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT username
    INTO v_author_name
    FROM public.profiles
   WHERE id = NEW.created_by;

  v_title := COALESCE(v_author_name, 'Someone') || ' mentioned you';
  v_body  := 'In ' || COALESCE(v_discussion.title, 'a discussion');
  v_href  := '/forum/' || COALESCE(v_discussion.slug, v_discussion.id::text);

  FOR v_mentioned_id IN
    SELECT DISTINCT m[1]::uuid
      FROM regexp_matches(NEW.markdown, '@\{([0-9a-f-]{36})\}', 'gi') AS m
     WHERE m[1]::uuid IS DISTINCT FROM NEW.created_by
  LOOP
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_mentioned_id) THEN
      INSERT INTO public.user_notifications (
        user_id,
        title,
        body,
        href,
        is_read,
        source,
        source_id,
        created_by
      ) VALUES (
        v_mentioned_id,
        v_title,
        v_body,
        v_href,
        false,
        'mention',
        NEW.id::text,
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
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notify_mentioned_users_on_reply ON public.discussion_replies;
CREATE TRIGGER notify_mentioned_users_on_reply
  AFTER INSERT ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_notify_mentioned_users();

GRANT EXECUTE ON FUNCTION public.trigger_notify_mentioned_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_notify_mentioned_users() TO service_role;

DROP FUNCTION IF EXISTS public.notify_mentioned_users();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. trigger_notify_reply_to_reply_author
--    Replaces: notify_reply_to_reply_author
--    Table:    discussion_replies (AFTER INSERT)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_notify_reply_to_reply_author()
RETURNS TRIGGER
SECURITY DEFINER
AS $$
DECLARE
  v_discussion      record;
  v_original_reply  record;
  v_author_name     text;
  v_title           text;
  v_body            text;
  v_href            text;
BEGIN
  IF NEW.reply_to_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, created_by, discussion_id
    INTO v_original_reply
    FROM public.discussion_replies
   WHERE id = NEW.reply_to_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_original_reply.created_by IS NULL
     OR v_original_reply.created_by = NEW.created_by THEN
    RETURN NEW;
  END IF;

  SELECT id, title, slug
    INTO v_discussion
    FROM public.discussions
   WHERE id = NEW.discussion_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT username
    INTO v_author_name
    FROM public.profiles
   WHERE id = NEW.created_by;

  v_title := COALESCE(v_author_name, 'Someone') || ' replied to you';
  v_body  := 'In ' || COALESCE(v_discussion.title, 'a discussion');
  v_href  := '/forum/' || COALESCE(v_discussion.slug, v_discussion.id::text);

  INSERT INTO public.user_notifications (
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
    NEW.id::text,
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notify_reply_to_reply_author_on_reply ON public.discussion_replies;
CREATE TRIGGER notify_reply_to_reply_author_on_reply
  AFTER INSERT ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_notify_reply_to_reply_author();

GRANT EXECUTE ON FUNCTION public.trigger_notify_reply_to_reply_author() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_notify_reply_to_reply_author() TO service_role;

DROP FUNCTION IF EXISTS public.notify_reply_to_reply_author();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. trigger_notify_and_reset_event_rsvps_on_date_change
--    Replaces: reset_event_rsvps_on_date_change
--    Table:    events (AFTER UPDATE OF date)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_notify_and_reset_event_rsvps_on_date_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.date IS DISTINCT FROM NEW.date THEN
    WITH affected_users AS (
      UPDATE public.events_rsvps
      SET rsvp = 'tentative'
      WHERE event_id = NEW.id
        AND rsvp = 'yes'
      RETURNING user_id
    )
    INSERT INTO public.user_notifications (user_id, title, body, href, source, source_id)
    SELECT
      user_id,
      NEW.title || ' was rescheduled',
      'Your RSVP was changed to tentative.',
      '/events/' || NEW.id,
      'event_rescheduled',
      NEW.id::text
    FROM affected_users
    ON CONFLICT (user_id, source, source_id) WHERE source IS NOT NULL AND source_id IS NOT NULL
    DO UPDATE SET
      title       = EXCLUDED.title,
      body        = EXCLUDED.body,
      href        = EXCLUDED.href,
      is_read     = false,
      modified_at = now();
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.trigger_notify_and_reset_event_rsvps_on_date_change() IS
  'When an event date changes, downgrades yes RSVPs to tentative and sends a notification to each affected user.';

DROP TRIGGER IF EXISTS reset_event_rsvps_on_date_change_trigger ON public.events;
CREATE TRIGGER reset_event_rsvps_on_date_change_trigger
  AFTER UPDATE OF date ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_notify_and_reset_event_rsvps_on_date_change();

DROP FUNCTION IF EXISTS public.reset_event_rsvps_on_date_change();
