-- Add a simple slugify helper that mirrors the frontend's slugify() function.
-- This keeps slug generation consistent between DB triggers and the UI.
CREATE OR REPLACE FUNCTION public.slugify(input text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  STRICT
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(trim(input)),
            '\s+', '-', 'g'        -- spaces -> hyphens
          ),
          '[^\w-]', '', 'g'        -- strip non-word, non-hyphen chars
        ),
        '-+', '-', 'g'             -- collapse multiple hyphens
      ),
      '^-+', ''                    -- trim leading hyphens
    ),
    '-+$', ''                      -- trim trailing hyphens
  )
$$;

-- Find the next available slug by appending -2, -3, ... until no conflict is found.
-- Used for projects and gameservers where no natural disambiguator exists.
CREATE OR REPLACE FUNCTION public.unique_discussion_slug(base_slug text)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
AS $$
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
$$;

-- Update create_discussion_for_entity to also populate slug.
-- Slug format:
--   events:      [prefix]-[slugified_title]-[YYYY-MM-DD]
--   gameservers: [prefix]-[slugified_title]  (with -2/-3/... counter on conflict)
--   projects:    [prefix]-[slugified_title]  (with -2/-3/... counter on conflict)
-- Profiles and referendums intentionally get no slug (not browseable by slug).
CREATE OR REPLACE FUNCTION public.create_discussion_for_entity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  target_col        text  := TG_ARGV[0];
  target_topic_slug text  := TG_ARGV[1];
  found_topic_id    uuid;
  entity_title      text;
  entity_desc       text;
  entity_slug       text;
  slug_prefix       text;
  new_json          jsonb := to_jsonb(NEW);
BEGIN
  -- Resolve optional topic
  IF target_topic_slug IS NOT NULL THEN
    SELECT id INTO found_topic_id
    FROM public.discussion_topics
    WHERE slug = target_topic_slug;
  END IF;

  -- Extract title (priority: title > name > username)
  IF new_json ? 'title' THEN
    entity_title := new_json ->> 'title';
  ELSIF new_json ? 'name' THEN
    entity_title := new_json ->> 'name';
  ELSIF new_json ? 'username' THEN
    entity_title := new_json ->> 'username';
  END IF;

  -- Extract description (priority: description > introduction)
  IF new_json ? 'description' THEN
    entity_desc := new_json ->> 'description';
  ELSIF new_json ? 'introduction' THEN
    entity_desc := new_json ->> 'introduction';
  END IF;

  -- Build slug for entity types that benefit from one.
  -- Events get a date suffix (natural disambiguator).
  -- Gameservers and projects get a counter suffix on conflict.
  -- Profiles and referendums get no slug.
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

  EXECUTE format(
    'INSERT INTO public.discussions (%I, discussion_topic_id, title, description, slug)
     VALUES ($1, $2, $3, $4, $5)',
    target_col
  )
  USING NEW.id, found_topic_id, entity_title, entity_desc, entity_slug;

  RETURN NEW;
END;
$$;

-- Update sync_discussion_from_entity to also sync the slug when the title changes.
-- We only regenerate the slug if the current slug starts with the expected prefix
-- (i.e. it was auto-generated, not manually overridden by an admin).
-- For events the date is re-read from the discussion's linked event row to stay accurate.
-- For gameservers/projects a counter suffix is applied on conflict, but the existing
-- slug is kept if it is already unique to avoid unnecessary churn.
CREATE OR REPLACE FUNCTION public.sync_discussion_from_entity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  target_col    text  := TG_ARGV[0];
  entity_title  text;
  entity_desc   text;
  new_slug      text;
  slug_prefix   text;
  current_slug  text;
  new_json      jsonb := to_jsonb(NEW);
BEGIN
  -- Extract title
  IF new_json ? 'title' THEN
    entity_title := new_json ->> 'title';
  ELSIF new_json ? 'name' THEN
    entity_title := new_json ->> 'name';
  ELSIF new_json ? 'username' THEN
    entity_title := new_json ->> 'username';
  END IF;

  -- Extract description
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
    -- No slug logic for this entity type, just sync title/description
    EXECUTE format(
      'UPDATE public.discussions SET title = $1, description = $2 WHERE %I = $3',
      target_col
    )
    USING entity_title, entity_desc, NEW.id;
    RETURN NEW;
  END IF;

  -- Fetch the current slug so we can check whether it was auto-generated
  EXECUTE format(
    'SELECT slug FROM public.discussions WHERE %I = $1',
    target_col
  )
  INTO current_slug
  USING NEW.id;

  -- Only touch the slug if it is NULL or starts with our auto prefix (not manually set)
  IF current_slug IS NULL OR current_slug LIKE slug_prefix || '-%' THEN
    IF target_col = 'event_id' THEN
      new_slug := 'event-'
        || public.slugify(entity_title)
        || '-'
        || to_char((new_json ->> 'date')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD');

      EXECUTE format(
        'UPDATE public.discussions
            SET title = $1, description = $2, slug = $3
          WHERE %I = $4',
        target_col
      )
      USING entity_title, entity_desc, new_slug, NEW.id;

    ELSE
      -- Gameserver / project: build candidate and deduplicate, but skip the
      -- counter step if the candidate is already this discussion's own slug.
      new_slug := slug_prefix || '-' || public.slugify(entity_title);

      IF new_slug <> current_slug THEN
        new_slug := public.unique_discussion_slug(new_slug);
      END IF;

      EXECUTE format(
        'UPDATE public.discussions
            SET title = $1, description = $2, slug = $3
          WHERE %I = $4',
        target_col
      )
      USING entity_title, entity_desc, new_slug, NEW.id;
    END IF;
  ELSE
    -- Manually set slug - only sync title/description
    EXECUTE format(
      'UPDATE public.discussions SET title = $1, description = $2 WHERE %I = $3',
      target_col
    )
    USING entity_title, entity_desc, NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill slugs for existing entity discussions that don't have one yet.
-- Events: title + date suffix.
-- Gameservers / projects: counter suffix via unique_discussion_slug.
-- Order by id ascending so counter assignment is stable across re-runs on a
-- fresh DB (backfill only touches rows where slug IS NULL).

UPDATE public.discussions d
SET slug = 'event-'
  || public.slugify(e.title)
  || '-'
  || to_char(e.date AT TIME ZONE 'UTC', 'YYYY-MM-DD')
FROM public.events e
WHERE d.event_id = e.id
  AND d.slug IS NULL
  AND e.title IS NOT NULL
  AND e.title <> ''
  AND e.date IS NOT NULL;

-- Gameservers: process one row at a time in id order so unique_discussion_slug
-- sees previously assigned slugs within the same backfill pass.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT d.id AS discussion_id, 'gameserver-' || public.slugify(gs.name) AS base_slug
    FROM public.discussions d
    JOIN public.gameservers gs ON gs.id = d.gameserver_id
    WHERE d.slug IS NULL
      AND gs.name IS NOT NULL
      AND gs.name <> ''
    ORDER BY d.id
  LOOP
    UPDATE public.discussions
    SET slug = public.unique_discussion_slug(r.base_slug)
    WHERE id = r.discussion_id;
  END LOOP;
END;
$$;

-- Projects: same approach.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT d.id AS discussion_id, 'project-' || public.slugify(p.title) AS base_slug
    FROM public.discussions d
    JOIN public.projects p ON p.id = d.project_id
    WHERE d.slug IS NULL
      AND p.title IS NOT NULL
      AND p.title <> ''
    ORDER BY d.id
  LOOP
    UPDATE public.discussions
    SET slug = public.unique_discussion_slug(r.base_slug)
    WHERE id = r.discussion_id;
  END LOOP;
END;
$$;
