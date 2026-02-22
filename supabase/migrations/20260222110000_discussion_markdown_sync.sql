-- Switch to syncing entity markdown into discussions.
-- This adds discussions.markdown and keeps it in sync with entity markdown fields.

-- 1) Add markdown column to discussions
ALTER TABLE public.discussions
  ADD COLUMN IF NOT EXISTS markdown text;

COMMENT ON COLUMN public.discussions.markdown IS 'Markdown body synced from attached entity (events/projects/gameservers/profiles).';

-- 2) Backfill existing discussions with markdown from their parent entities
UPDATE public.discussions d
SET markdown = e.markdown
FROM public.events e
WHERE d.event_id = e.id
  AND e.markdown IS NOT NULL
  AND d.markdown IS DISTINCT FROM e.markdown;

UPDATE public.discussions d
SET markdown = p.markdown
FROM public.projects p
WHERE d.project_id = p.id
  AND p.markdown IS NOT NULL
  AND d.markdown IS DISTINCT FROM p.markdown;

UPDATE public.discussions d
SET markdown = g.markdown
FROM public.gameservers g
WHERE d.gameserver_id = g.id
  AND g.markdown IS NOT NULL
  AND d.markdown IS DISTINCT FROM g.markdown;



-- 3) Update create function to capture entity markdown on insert
CREATE OR REPLACE FUNCTION public.create_discussion_for_entity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
DECLARE
  target_col text := TG_ARGV[0];
  target_topic_slug text := TG_ARGV[1]; -- Optional topic slug
  found_topic_id uuid;
  entity_title text;
  entity_desc text;
  entity_created_by uuid;
  entity_markdown text;
  new_json jsonb := to_jsonb(NEW);
BEGIN
  -- If a topic slug is provided, try to find it
  IF target_topic_slug IS NOT NULL THEN
    SELECT id
      INTO found_topic_id
    FROM public.discussion_topics
    WHERE slug = target_topic_slug;
  END IF;

  -- Try to extract title/name and description/introduction from the record.
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

  IF new_json ? 'markdown' THEN
    entity_markdown := new_json ->> 'markdown';
  END IF;

  -- Determine discussion creator.
  -- For most entities this is `created_by`; for profile-linked discussions it should be the profile owner (`id`).
  IF target_col = 'profile_id' THEN
    entity_created_by := NEW.id;
  ELSIF new_json ? 'created_by' THEN
    entity_created_by := (new_json ->> 'created_by')::uuid;
  ELSE
    entity_created_by := NULL;
  END IF;

  -- Insert discussion with entity ownership aligned.
  EXECUTE format(
    'INSERT INTO public.discussions (%I, discussion_topic_id, title, description, markdown, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
    target_col
  )
  USING NEW.id, found_topic_id, entity_title, entity_desc, entity_markdown, entity_created_by;

  RETURN NEW;
END;
$$;

-- 4) Sync function for entity markdown updates
CREATE OR REPLACE FUNCTION public.sync_discussion_markdown_from_entity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
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
$$;

-- 5) Create update triggers for markdown sync
-- Events
DROP TRIGGER IF EXISTS sync_discussion_markdown_on_event_update ON public.events;
CREATE TRIGGER sync_discussion_markdown_on_event_update
  AFTER UPDATE OF markdown ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_discussion_markdown_from_entity('event_id');

-- Projects
DROP TRIGGER IF EXISTS sync_discussion_markdown_on_project_update ON public.projects;
CREATE TRIGGER sync_discussion_markdown_on_project_update
  AFTER UPDATE OF markdown ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_discussion_markdown_from_entity('project_id');

-- Gameservers
DROP TRIGGER IF EXISTS sync_discussion_markdown_on_gameserver_update ON public.gameservers;
CREATE TRIGGER sync_discussion_markdown_on_gameserver_update
  AFTER UPDATE OF markdown ON public.gameservers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_discussion_markdown_from_entity('gameserver_id');
