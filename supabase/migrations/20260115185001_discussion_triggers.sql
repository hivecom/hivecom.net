-- Create generic trigger function to create discussions automatically
CREATE OR REPLACE FUNCTION public.create_discussion_for_entity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
DECLARE
  target_col text := TG_ARGV[0];
  target_topic_slug text := TG_ARGV[1]; -- Optional topic slug
  found_topic_id uuid;
BEGIN
  -- If a topic slug is provided, try to find it
  IF target_topic_slug IS NOT NULL THEN
    SELECT id INTO found_topic_id FROM public.discussion_topics WHERE slug = target_topic_slug;
  END IF;

  -- We use dynamic SQL because the target column name varies
  EXECUTE format(
    'INSERT INTO public.discussions (%I, discussion_topic_id) VALUES ($1, $2)',
    target_col
  )
  USING NEW.id, found_topic_id;

  RETURN NEW;
END;
$$;

-- Create triggers for each entity type

-- Announcements
DROP TRIGGER IF EXISTS create_discussion_on_announcement ON public.announcements;
CREATE TRIGGER create_discussion_on_announcement
  AFTER INSERT ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('announcement_id', 'announcements');

-- Events
DROP TRIGGER IF EXISTS create_discussion_on_event ON public.events;
CREATE TRIGGER create_discussion_on_event
  AFTER INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('event_id', 'events');

-- Referendums
DROP TRIGGER IF EXISTS create_discussion_on_referendum ON public.referendums;
CREATE TRIGGER create_discussion_on_referendum
  AFTER INSERT ON public.referendums
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('referendum_id', 'governance');

-- Projects
DROP TRIGGER IF EXISTS create_discussion_on_project ON public.projects;
CREATE TRIGGER create_discussion_on_project
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('project_id', 'projects');

-- Gameservers (No topic assigned automatically for now)
DROP TRIGGER IF EXISTS create_discussion_on_gameserver ON public.gameservers;
CREATE TRIGGER create_discussion_on_gameserver
  AFTER INSERT ON public.gameservers
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('gameserver_id', NULL);

-- Profiles (No topic)
DROP TRIGGER IF EXISTS create_discussion_on_profile ON public.profiles;
CREATE TRIGGER create_discussion_on_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('profile_id', NULL);
