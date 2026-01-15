-- Add project_id to discussions table
ALTER TABLE public.discussions
  ADD COLUMN project_id bigint REFERENCES public.projects(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX discussions_project_unique_idx ON public.discussions(project_id) WHERE project_id IS NOT NULL;

-- Update the check constraint to include project
ALTER TABLE public.discussions DROP CONSTRAINT discussions_type_fk_check;

ALTER TABLE public.discussions
  ADD CONSTRAINT discussions_type_fk_check CHECK (
    (type = 'forum' AND forum_category_id IS NOT NULL) OR
    (type = 'announcement' AND announcement_id IS NOT NULL) OR
    (type = 'event' AND event_id IS NOT NULL) OR
    (type = 'referendum' AND referendum_id IS NOT NULL) OR
    (type = 'profile' AND profile_id IS NOT NULL) OR
    (type = 'project' AND project_id IS NOT NULL)
  );

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

-- Profiles
-- Note: Profiles usually auto-created via auth triggers, so this chains off that
DROP TRIGGER IF EXISTS create_discussion_on_profile ON public.profiles;
CREATE TRIGGER create_discussion_on_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('profile', 'profile_id');
