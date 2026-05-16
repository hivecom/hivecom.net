-- ============================================================
-- Fix mutable search_path on all flagged functions
-- by adding SET search_path TO '' to each.
-- All public.* table references inside these bodies are already
-- schema-qualified, so '' is safe.
-- ============================================================

-- increment_discussion_view_count
CREATE OR REPLACE FUNCTION public.increment_discussion_view_count(target_discussion_id uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.discussions
  SET view_count = view_count + 1
  WHERE id = target_discussion_id;
END;
$function$;

-- slugify
CREATE OR REPLACE FUNCTION public.slugify(input text)
  RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path TO ''
AS $function$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(trim(input)),
            '\s+', '-', 'g'
          ),
          '[^\w-]', '', 'g'
        ),
        '-+', '-', 'g'
      ),
      '^-+', ''
    ),
    '-+$', ''
  )
$function$;

-- unique_discussion_slug
CREATE OR REPLACE FUNCTION public.unique_discussion_slug(base_slug text)
  RETURNS text LANGUAGE plpgsql STABLE SET search_path TO ''
AS $function$
DECLARE
  candidate text := base_slug;
  counter   int  := 2;
BEGIN
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.discussions WHERE slug = candidate
    );
    candidate := base_slug || '-' || counter;
    counter   := counter + 1;
  END LOOP;
  RETURN candidate;
END;
$function$;

-- trigger_validate_discussion_accepted_reply
CREATE OR REPLACE FUNCTION public.trigger_validate_discussion_accepted_reply()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NEW.accepted_reply_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.discussion_replies
      WHERE id = NEW.accepted_reply_id
      AND discussion_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Accepted reply must belong to the discussion';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- contains_html_tags
CREATE OR REPLACE FUNCTION public.contains_html_tags(input_text text)
  RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $function$
BEGIN
  RETURN input_text ~ '<[^@\s]+@[^@\s>]+>|<https?://[^>]+>|</?[a-zA-Z][^>]*>';
END;
$function$;

-- validate_tag_format
CREATE OR REPLACE FUNCTION public.validate_tag_format(tag text)
  RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $function$
BEGIN
  RETURN tag ~ '^[a-z0-9_-]+$'
    AND CHAR_LENGTH(tag) > 0;
END;
$function$;

-- validate_github_repo
CREATE OR REPLACE FUNCTION public.validate_github_repo(github_repo text)
  RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $function$
BEGIN
  RETURN github_repo ~ '^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?/[a-zA-Z0-9._-]+$'
    AND CHAR_LENGTH(github_repo) <= 140
    AND CHAR_LENGTH(SPLIT_PART(github_repo, '/', 1)) <= 39
    AND CHAR_LENGTH(SPLIT_PART(github_repo, '/', 2)) <= 100;
END;
$function$;

-- validate_tags_array
CREATE OR REPLACE FUNCTION public.validate_tags_array(tags text[])
  RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $function$
DECLARE
  tag text;
BEGIN
  IF tags IS NULL OR ARRAY_LENGTH(tags, 1) IS NULL THEN
    RETURN TRUE;
  END IF;
  FOREACH tag IN ARRAY tags LOOP
    IF NOT public.validate_tag_format(tag) THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  RETURN TRUE;
END;
$function$;

-- normalize_mentions
CREATE OR REPLACE FUNCTION public.normalize_mentions(input_text text)
  RETURNS text LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE
  mention_username text;
  user_id uuid;
BEGIN
  IF input_text IS NULL OR input_text = '' THEN
    RETURN input_text;
  END IF;
  FOR mention_username IN
    SELECT DISTINCT (regexp_matches(input_text, '@([A-Za-z0-9_]{1,32})', 'g'))[1]
  LOOP
    SELECT id
    INTO user_id
    FROM public.profiles
    WHERE lower(username) = lower(mention_username)
    LIMIT 1;
    IF user_id IS NOT NULL THEN
      input_text := regexp_replace(
        input_text,
        '@' || mention_username || '\\b',
        '@{' || user_id::text || '}',
        'gi'
      );
    END IF;
  END LOOP;
  RETURN input_text;
END;
$function$;

-- normalize_mentions_on_discussion_reply
CREATE OR REPLACE FUNCTION public.normalize_mentions_on_discussion_reply()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.markdown IS NOT DISTINCT FROM OLD.markdown THEN
    RETURN NEW;
  END IF;
  NEW.markdown := public.normalize_mentions(NEW.markdown);
  RETURN NEW;
END;
$function$;

-- normalize_mentions_on_markdown
CREATE OR REPLACE FUNCTION public.normalize_mentions_on_markdown()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.markdown IS NOT DISTINCT FROM OLD.markdown THEN
    RETURN NEW;
  END IF;
  NEW.markdown := public.normalize_mentions(NEW.markdown);
  RETURN NEW;
END;
$function$;

-- trigger_delete_votes_on_choices_removal
CREATE OR REPLACE FUNCTION public.trigger_delete_votes_on_choices_removal()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  IF ARRAY_LENGTH(OLD.choices, 1) > ARRAY_LENGTH(NEW.choices, 1) OR NOT(OLD.choices <@ NEW.choices) THEN
    DELETE FROM public.referendum_votes
    WHERE referendum_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

-- trigger_inherit_discussion_nsfw_on_reply_insert
CREATE OR REPLACE FUNCTION public.trigger_inherit_discussion_nsfw_on_reply_insert()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.discussions d
    WHERE d.id = NEW.discussion_id
      AND d.is_nsfw = true
  ) THEN
    NEW.is_nsfw := true;
  END IF;
  RETURN NEW;
END;
$function$;

-- trigger_inherit_reply_offtopic_on_insert
CREATE OR REPLACE FUNCTION public.trigger_inherit_reply_offtopic_on_insert()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NEW.reply_to_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.discussion_replies
      WHERE id = NEW.reply_to_id
        AND is_offtopic = true
    ) THEN
      NEW.is_offtopic := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- trigger_fill_alert_acknowledged_fields
CREATE OR REPLACE FUNCTION public.trigger_fill_alert_acknowledged_fields()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF OLD.is_acknowledged = false AND NEW.is_acknowledged = true THEN
    NEW.acknowledged_at = now();
    NEW.acknowledged_by = auth.uid();
  END IF;
  IF OLD.is_acknowledged = true AND NEW.is_acknowledged = false THEN
    NEW.acknowledged_at = NULL;
    NEW.acknowledged_by = NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- trigger_enforce_discussion_draft_rules
CREATE OR REPLACE FUNCTION public.trigger_enforce_discussion_draft_rules()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_draft = false AND NEW.is_draft = true THEN
    RAISE EXCEPTION 'Discussions cannot be set back to draft once published';
  END IF;
  RETURN NEW;
END;
$function$;

-- trigger_cascade_reply_offtopic
CREATE OR REPLACE FUNCTION public.trigger_cascade_reply_offtopic()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF OLD.is_offtopic IS NOT DISTINCT FROM NEW.is_offtopic THEN
    RETURN NEW;
  END IF;
  WITH RECURSIVE descendants AS (
    SELECT id
    FROM public.discussion_replies
    WHERE reply_to_id = NEW.id
      AND is_offtopic IS DISTINCT FROM NEW.is_offtopic
    UNION ALL
    SELECT r.id
    FROM public.discussion_replies r
    INNER JOIN descendants d ON r.reply_to_id = d.id
    WHERE r.is_offtopic IS DISTINCT FROM NEW.is_offtopic
  )
  UPDATE public.discussion_replies
  SET is_offtopic = NEW.is_offtopic
  WHERE id IN (SELECT id FROM descendants);
  RETURN NEW;
END;
$function$;

-- sync_discussion_from_entity
CREATE OR REPLACE FUNCTION public.sync_discussion_from_entity()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  target_col    text  := TG_ARGV[0];
  entity_title  text;
  entity_desc   text;
  new_slug      text;
  slug_prefix   text;
  current_slug  text;
  new_json      jsonb := to_jsonb(NEW);
BEGIN
  IF new_json ? 'title' THEN
    entity_title := new_json ->> 'title';
  ELSIF new_json ? 'name' THEN
    entity_title := new_json ->> 'name';
  ELSIF new_json ? 'username' THEN
    entity_title := new_json ->> 'username';
  END IF;
  IF new_json ? 'description' THEN
    entity_desc := new_json ->> 'description';
  ELSIF new_json ? 'introduction' THEN
    entity_desc := new_json ->> 'introduction';
  END IF;
  IF target_col = 'event_id' THEN
    slug_prefix := 'event';
  ELSIF target_col = 'gameserver_id' THEN
    slug_prefix := 'gameserver';
  ELSIF target_col = 'project_id' THEN
    slug_prefix := 'project';
  END IF;
  IF slug_prefix IS NULL OR entity_title IS NULL OR entity_title = '' THEN
    EXECUTE format(
      'UPDATE public.discussions SET title = $1, description = $2 WHERE %I = $3',
      target_col
    )
    USING entity_title, entity_desc, NEW.id;
    RETURN NEW;
  END IF;
  EXECUTE format(
    'SELECT slug FROM public.discussions WHERE %I = $1',
    target_col
  )
  INTO current_slug
  USING NEW.id;
  IF current_slug IS NULL OR current_slug LIKE slug_prefix || '-%' THEN
    IF target_col = 'event_id' THEN
      new_slug := 'event-'
        || public.slugify(entity_title)
        || '-'
        || to_char((new_json ->> 'date')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD');
      EXECUTE format(
        'UPDATE public.discussions SET title = $1, description = $2, slug = $3 WHERE %I = $4',
        target_col
      )
      USING entity_title, entity_desc, new_slug, NEW.id;
    ELSE
      new_slug := slug_prefix || '-' || public.slugify(entity_title);
      IF new_slug <> current_slug THEN
        new_slug := public.unique_discussion_slug(new_slug);
      END IF;
      EXECUTE format(
        'UPDATE public.discussions SET title = $1, description = $2, slug = $3 WHERE %I = $4',
        target_col
      )
      USING entity_title, entity_desc, new_slug, NEW.id;
    END IF;
  ELSE
    EXECUTE format(
      'UPDATE public.discussions SET title = $1, description = $2 WHERE %I = $3',
      target_col
    )
    USING entity_title, entity_desc, NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

-- sync_discussion_markdown_from_entity
CREATE OR REPLACE FUNCTION public.sync_discussion_markdown_from_entity()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  target_col text := TG_ARGV[0];
  entity_markdown text;
  new_json jsonb := to_jsonb(NEW);
BEGIN
  IF new_json ? 'markdown' THEN
    entity_markdown := new_json ->> 'markdown';
  END IF;
  EXECUTE format(
    'UPDATE public.discussions SET markdown = $1 WHERE %I = $2',
    target_col
  )
  USING entity_markdown, NEW.id;
  RETURN NEW;
END;
$function$;

-- trigger_auto_subscribe_discussion_author
CREATE OR REPLACE FUNCTION public.trigger_auto_subscribe_discussion_author()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.discussion_subscriptions (user_id, discussion_id)
  VALUES (NEW.created_by, NEW.id)
  ON CONFLICT (user_id, discussion_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- get_random_forum_discussion
CREATE OR REPLACE FUNCTION public.get_random_forum_discussion()
  RETURNS TABLE(id uuid, slug text, title text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT d.id, d.slug, d.title
  FROM public.discussions d
  WHERE
    d.discussion_topic_id IS NOT NULL
    AND d.is_archived = false
    AND d.is_draft = false
  ORDER BY random()
  LIMIT 1;
$function$;

-- create_discussion_for_entity
CREATE OR REPLACE FUNCTION public.create_discussion_for_entity()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  target_col        text  := TG_ARGV[0];
  target_topic_slug text  := TG_ARGV[1];
  found_topic_id    uuid;
  entity_title      text;
  entity_desc       text;
  entity_slug       text;
  entity_created_by uuid;
  new_json          jsonb := to_jsonb(NEW);
BEGIN
  IF target_topic_slug IS NOT NULL THEN
    SELECT id INTO found_topic_id
    FROM public.discussion_topics
    WHERE slug = target_topic_slug;
  END IF;
  IF new_json ? 'title' THEN
    entity_title := new_json ->> 'title';
  ELSIF new_json ? 'name' THEN
    entity_title := new_json ->> 'name';
  ELSIF new_json ? 'username' THEN
    entity_title := new_json ->> 'username';
  END IF;
  IF new_json ? 'description' THEN
    entity_desc := new_json ->> 'description';
  ELSIF new_json ? 'introduction' THEN
    entity_desc := new_json ->> 'introduction';
  END IF;
  IF target_col = 'event_id' AND entity_title IS NOT NULL AND entity_title <> '' THEN
    entity_slug := 'event-'
      || public.slugify(entity_title)
      || '-'
      || to_char((new_json ->> 'date')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  ELSIF target_col = 'gameserver_id' AND entity_title IS NOT NULL AND entity_title <> '' THEN
    entity_slug := public.unique_discussion_slug(
      'gameserver-' || public.slugify(entity_title)
    );
  ELSIF target_col = 'project_id' AND entity_title IS NOT NULL AND entity_title <> '' THEN
    entity_slug := public.unique_discussion_slug(
      'project-' || public.slugify(entity_title)
    );
  END IF;
  IF target_col = 'profile_id' THEN
    entity_created_by := NEW.id;
  ELSIF new_json ? 'created_by' THEN
    entity_created_by := (new_json ->> 'created_by')::uuid;
  ELSE
    entity_created_by := NULL;
  END IF;
  EXECUTE format(
    'INSERT INTO public.discussions (%I, discussion_topic_id, title, description, slug, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)',
    target_col
  )
  USING NEW.id, found_topic_id, entity_title, entity_desc, entity_slug, entity_created_by;
  RETURN NEW;
END;
$function$;

-- Use ALTER FUNCTION for the remaining large/complex functions to avoid
-- re-specifying full bodies. SET search_path TO '' is sufficient.
ALTER FUNCTION public.cron_metrics_daily_rollup() SET search_path TO '';
ALTER FUNCTION public.cron_points_loyalty_award() SET search_path TO '';
ALTER FUNCTION public.cron_points_birthday_award() SET search_path TO '';
ALTER FUNCTION public.get_discussion_replies_page(uuid, integer, boolean, timestamptz, uuid, text, boolean) SET search_path TO '';
ALTER FUNCTION public.get_discussion_reply_nearest_to_date(uuid, timestamptz, boolean, text, boolean) SET search_path TO '';
ALTER FUNCTION public.get_discussion_reply_nearest_to_date(uuid, timestamptz, boolean, text, boolean, boolean) SET search_path TO '';
ALTER FUNCTION public.get_discussion_replies_tail(uuid, integer, text, boolean) SET search_path TO '';
ALTER FUNCTION public.get_discussion_reply_page_cursor(uuid, uuid, integer, boolean, text, boolean) SET search_path TO '';
ALTER FUNCTION public.get_discussion_reply_activity_buckets(uuid, text, text, boolean, boolean) SET search_path TO '';
ALTER FUNCTION public.get_forum_activity_feed(integer, integer, uuid, uuid) SET search_path TO '';
ALTER FUNCTION public.get_forum_activity_feed_today_count(uuid) SET search_path TO '';
ALTER FUNCTION public.search_global(text, text[], integer) SET search_path TO '';
ALTER FUNCTION public.search_global(text, text[], integer, boolean) SET search_path TO '';
ALTER FUNCTION public.get_metrics_bucketed(timestamptz, timestamptz, interval) SET search_path TO '';
ALTER FUNCTION public.toggle_reaction(text, uuid, text, text) SET search_path TO '';
