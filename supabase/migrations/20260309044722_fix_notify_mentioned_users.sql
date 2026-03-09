-- Migration: Fix notify_mentioned_users trigger function
--
-- regexp_matches() returns text[] rows, not scalar text values.
-- The original function tried to alias the whole array as a column and then
-- cast it directly to uuid (text[] → uuid), which Postgres rejects.
-- The fix is to subscript the array with [1] to extract the capture group
-- as a scalar text value before casting to uuid.

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
  -- regexp_matches returns text[], so subscript [1] to get the scalar capture
  -- group before casting to uuid.
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
