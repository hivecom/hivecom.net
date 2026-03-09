-- Migration: Notify users when they are mentioned in a discussion reply
--
-- Extracts @{uuid} mention patterns from `discussion_replies.markdown` and
-- creates a notification for each mentioned user (excluding the reply author).
--
-- Mentions use `source = 'mention'` and `source_id = <reply_id>` so each
-- reply produces at most one notification per mentioned user. If the same
-- user is mentioned multiple times in the same reply, they only get one
-- notification thanks to the unique partial index on
-- (user_id, source, source_id).
--
-- This trigger fires AFTER INSERT, at which point the BEFORE INSERT
-- `normalize_mentions_on_discussion_replies_markdown` trigger has already
-- converted any `@username` mentions into `@{uuid}` format.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fan-out function
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_mentioned_users()
RETURNS TRIGGER AS $$
DECLARE
  v_discussion   record;
  v_author_name  text;
  v_title        text;
  v_body         text;
  v_href         text;
  v_mentioned_id uuid;
BEGIN
  -- Nothing to do if the reply has no markdown
  IF NEW.markdown IS NULL OR NEW.markdown = '' THEN
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

  -- Resolve the reply author's username
  SELECT username
    INTO v_author_name
    FROM public.profiles
   WHERE id = NEW.created_by;

  -- Build notification content
  v_title := COALESCE(v_author_name, 'Someone') || ' mentioned you';
  v_body  := 'In ' || COALESCE(v_discussion.title, 'a discussion');
  v_href  := '/forum/' || COALESCE(v_discussion.slug, v_discussion.id::text);

  -- Extract all @{uuid} mentions and create a notification for each unique
  -- mentioned user (excluding the reply author).
  FOR v_mentioned_id IN
    SELECT DISTINCT m[1]::uuid
      FROM regexp_matches(NEW.markdown, '@\{([0-9a-f-]{36})\}', 'gi') AS m
     WHERE m[1]::uuid IS DISTINCT FROM NEW.created_by
  LOOP
    -- Only notify users that actually exist
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_mentioned_id) THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER notify_mentioned_users_on_reply
  AFTER INSERT ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_mentioned_users();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.notify_mentioned_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_mentioned_users() TO service_role;

COMMIT;
