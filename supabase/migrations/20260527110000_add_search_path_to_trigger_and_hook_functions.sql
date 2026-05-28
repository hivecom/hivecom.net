-- Add SET search_path = '' to trigger functions and the custom_access_token_hook.
-- All functions are already fully schema-qualified internally; this change
-- closes the search_path injection vector without any logic changes.

-- ============================================================
-- 1. public.trigger_notify_mentioned_users
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_notify_mentioned_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
$$;

-- ============================================================
-- 2. public.trigger_cascade_discussion_nsfw_to_replies
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_cascade_discussion_nsfw_to_replies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.is_nsfw IS NOT DISTINCT FROM NEW.is_nsfw THEN
    RETURN NEW;
  END IF;

  -- Only cascade when the discussion becomes NSFW
  IF NEW.is_nsfw = true THEN
    UPDATE public.discussion_replies
    SET is_nsfw = true
    WHERE discussion_id = NEW.id
      AND is_nsfw = false;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. public.trigger_prevent_discussion_topic_cycles
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_prevent_discussion_topic_cycles()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  has_cycle boolean;
BEGIN
  -- Allow clearing parent
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Prevent direct self-reference
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'discussion_topics parent_id cannot reference itself';
  END IF;

  -- Detect any ancestor chain that leads back to this topic
  WITH RECURSIVE ancestors AS (
    SELECT dt.id, dt.parent_id
    FROM public.discussion_topics dt
    WHERE dt.id = NEW.parent_id

    UNION ALL

    SELECT parent.id, parent.parent_id
    FROM public.discussion_topics parent
    JOIN ancestors a ON a.parent_id = parent.id
  )
  SELECT EXISTS (
    SELECT 1 FROM ancestors WHERE id = NEW.id
  )
  INTO has_cycle;

  IF has_cycle THEN
    RAISE EXCEPTION 'discussion_topics parent_id creates a circular dependency';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. public.trigger_notify_reply_to_reply_author
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_notify_reply_to_reply_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
$$;

-- ============================================================
-- 5. public.custom_access_token_hook
-- ============================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path = ''
AS $$
DECLARE
  claims jsonb;
  user_role public.app_role;
  profile_banned boolean := false;
  profile_ban_end timestamptz;
  profile_ban_reason text;
  active_ban boolean := false;
  ban_message text;
BEGIN
  -- Fetch application role for the JWT claim
  SELECT role
    INTO user_role
    FROM public.user_roles
   WHERE user_id = (event->>'user_id')::uuid;

  -- Retrieve ban information
  SELECT banned, ban_end, ban_reason
    INTO profile_banned, profile_ban_end, profile_ban_reason
    FROM public.profiles
   WHERE id = (event->>'user_id')::uuid;

  IF COALESCE(profile_banned, false) THEN
    IF profile_ban_end IS NULL OR profile_ban_end > now() THEN
      active_ban := true;
      ban_message := COALESCE(
        'Account suspended: ' || profile_ban_reason,
        'Account suspended. Please contact support.'
      );
    END IF;
  END IF;

  IF active_ban THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', ban_message
      )
    );
  END IF;

  claims := event->'claims';

  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  ELSE
    claims := jsonb_set(claims, '{user_role}', 'null');
  END IF;

  event := jsonb_set(event, '{claims}', claims);

  RETURN event;
END;
$$;

-- ============================================================
-- 6. private.compute_count_badge_tier
-- ============================================================
CREATE OR REPLACE FUNCTION private.compute_count_badge_tier(
  p_count            integer,
  p_threshold_shiny  integer,
  p_threshold_gold   integer,
  p_threshold_silver integer,
  p_threshold_bronze integer
)
RETURNS public.badge_tier
LANGUAGE sql
IMMUTABLE
CALLED ON NULL INPUT
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_threshold_shiny  IS NOT NULL AND p_count >= p_threshold_shiny  THEN 'shiny'::public.badge_tier
    WHEN p_threshold_gold   IS NOT NULL AND p_count >= p_threshold_gold   THEN 'gold'::public.badge_tier
    WHEN p_threshold_silver IS NOT NULL AND p_count >= p_threshold_silver THEN 'silver'::public.badge_tier
    WHEN p_threshold_bronze IS NOT NULL AND p_count >= p_threshold_bronze THEN 'bronze'::public.badge_tier
    ELSE null
  END
$$;
