-- Backfill existing discussions with titles and descriptions from their parent entities
UPDATE public.discussions
SET title = events.title, description = events.description
FROM public.events
WHERE discussions.event_id = events.id;

UPDATE public.discussions
SET title = announcements.title, description = announcements.description
FROM public.announcements
WHERE discussions.announcement_id = announcements.id;

UPDATE public.discussions
SET title = projects.title, description = projects.description
FROM public.projects
WHERE discussions.project_id = projects.id;

UPDATE public.discussions
SET title = gameservers.name, description = gameservers.description
FROM public.gameservers
WHERE discussions.gameserver_id = gameservers.id;

UPDATE public.discussions
SET title = profiles.username, description = profiles.introduction
FROM public.profiles
WHERE discussions.profile_id = profiles.id;

-- Update the create function to automatically populate title/description on insert
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
  new_json jsonb := to_jsonb(NEW);
BEGIN
  -- If a topic slug is provided, try to find it
  IF target_topic_slug IS NOT NULL THEN
    SELECT id INTO found_topic_id FROM public.discussion_topics WHERE slug = target_topic_slug;
  END IF;

  -- Try to extract title/name and description/introduction from the record
  -- We prioritize 'title' then 'name' (for gameservers) then 'username' (for profiles)
  IF new_json ? 'title' THEN
    entity_title := new_json ->> 'title';
  ELSIF new_json ? 'name' THEN
    entity_title := new_json ->> 'name';
  ELSIF new_json ? 'username' THEN
    entity_title := new_json ->> 'username';
  END IF;

  -- Prioritize 'description' then 'introduction' (for profiles)
  IF new_json ? 'description' THEN
    entity_desc := new_json ->> 'description';
  ELSIF new_json ? 'introduction' THEN
    entity_desc := new_json ->> 'introduction';
  END IF;

  -- We use dynamic SQL because the target column name varies
  EXECUTE format(
    'INSERT INTO public.discussions (%I, discussion_topic_id, title, description) VALUES ($1, $2, $3, $4)',
    target_col
  )
  USING NEW.id, found_topic_id, entity_title, entity_desc;

  RETURN NEW;
END;
$$;

-- Create a generic sync function for updates
CREATE OR REPLACE FUNCTION public.sync_discussion_from_entity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
DECLARE
  target_col text := TG_ARGV[0];
  entity_title text;
  entity_desc text;
  new_json jsonb := to_jsonb(NEW);
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

  EXECUTE format(
    'UPDATE public.discussions SET title = $1, description = $2 WHERE %I = $3',
    target_col
  )
  USING entity_title, entity_desc, NEW.id;

  RETURN NEW;
END;
$$;

-- Create update triggers for the requested entities

-- Events
DROP TRIGGER IF EXISTS sync_discussion_on_event_update ON public.events;
CREATE TRIGGER sync_discussion_on_event_update
  AFTER UPDATE OF title, description ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_discussion_from_entity('event_id');

-- Announcements
DROP TRIGGER IF EXISTS sync_discussion_on_announcement_update ON public.announcements;
CREATE TRIGGER sync_discussion_on_announcement_update
  AFTER UPDATE OF title, description ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_discussion_from_entity('announcement_id');

-- Projects
DROP TRIGGER IF EXISTS sync_discussion_on_project_update ON public.projects;
CREATE TRIGGER sync_discussion_on_project_update
  AFTER UPDATE OF title, description ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_discussion_from_entity('project_id');

-- Gameservers
DROP TRIGGER IF EXISTS sync_discussion_on_gameserver_update ON public.gameservers;
CREATE TRIGGER sync_discussion_on_gameserver_update
  AFTER UPDATE OF name, description ON public.gameservers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_discussion_from_entity('gameserver_id');

-- Profiles
DROP TRIGGER IF EXISTS sync_discussion_on_profile_update ON public.profiles;
CREATE TRIGGER sync_discussion_on_profile_update
  AFTER UPDATE OF username, introduction ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_discussion_from_entity('profile_id');
