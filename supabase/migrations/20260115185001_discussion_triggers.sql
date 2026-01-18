-- Create generic trigger function to create discussions automatically
CREATE OR REPLACE FUNCTION public.create_discussion_for_entity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
DECLARE
  target_type text := TG_ARGV[0];
  target_col text := TG_ARGV[1];
BEGIN
  -- We use dynamic SQL because the target column name varies
  EXECUTE format(
    'INSERT INTO public.discussions (type, %I) VALUES ($1, $2)',
    target_col
  )
  USING target_type::public.discussion_type, NEW.id;

  RETURN NEW;
END;
$$;

-- Create triggers for each entity type

-- Announcements
DROP TRIGGER IF EXISTS create_discussion_on_announcement ON public.announcements;
CREATE TRIGGER create_discussion_on_announcement
  AFTER INSERT ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('announcement', 'announcement_id');

-- Events
DROP TRIGGER IF EXISTS create_discussion_on_event ON public.events;
CREATE TRIGGER create_discussion_on_event
  AFTER INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('event', 'event_id');

-- Referendums
DROP TRIGGER IF EXISTS create_discussion_on_referendum ON public.referendums;
CREATE TRIGGER create_discussion_on_referendum
  AFTER INSERT ON public.referendums
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('referendum', 'referendum_id');

-- Projects
DROP TRIGGER IF EXISTS create_discussion_on_project ON public.projects;
CREATE TRIGGER create_discussion_on_project
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('project', 'project_id');

-- Gameservers
DROP TRIGGER IF EXISTS create_discussion_on_gameserver ON public.gameservers;
CREATE TRIGGER create_discussion_on_gameserver
  AFTER INSERT ON public.gameservers
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('gameserver', 'gameserver_id');

-- Profiles
-- Note: Profiles usually auto-created via auth triggers, so this chains off that
DROP TRIGGER IF EXISTS create_discussion_on_profile ON public.profiles;
CREATE TRIGGER create_discussion_on_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('profile', 'profile_id');

-- Backfill existing entities to ensure they have discussions

-- Announcements
INSERT INTO public.discussions (type, announcement_id)
SELECT 'announcement', id FROM public.announcements
WHERE NOT EXISTS (SELECT 1 FROM public.discussions WHERE announcement_id = public.announcements.id);

-- Events
INSERT INTO public.discussions (type, event_id)
SELECT 'event', id FROM public.events
WHERE NOT EXISTS (SELECT 1 FROM public.discussions WHERE event_id = public.events.id);

-- Referendums
INSERT INTO public.discussions (type, referendum_id)
SELECT 'referendum', id FROM public.referendums
WHERE NOT EXISTS (SELECT 1 FROM public.discussions WHERE referendum_id = public.referendums.id);

-- Projects
INSERT INTO public.discussions (type, project_id)
SELECT 'project', id FROM public.projects
WHERE NOT EXISTS (SELECT 1 FROM public.discussions WHERE project_id = public.projects.id);

-- Gameservers
INSERT INTO public.discussions (type, gameserver_id)
SELECT 'gameserver', id FROM public.gameservers
WHERE NOT EXISTS (SELECT 1 FROM public.discussions WHERE gameserver_id = public.gameservers.id);

-- Profiles
INSERT INTO public.discussions (type, profile_id)
SELECT 'profile', id FROM public.profiles
WHERE NOT EXISTS (SELECT 1 FROM public.discussions WHERE profile_id = public.profiles.id);
