-- Backfill discussions for existing entities so they can be commented on immediately
-- This ensures the new system works for historical data

-- Announcements
INSERT INTO public.discussions (type, announcement_id)
SELECT 'announcement', id
FROM public.announcements a
WHERE NOT EXISTS (SELECT 1 FROM public.discussions d WHERE d.announcement_id = a.id);

-- Events
INSERT INTO public.discussions (type, event_id)
SELECT 'event', id
FROM public.events e
WHERE NOT EXISTS (SELECT 1 FROM public.discussions d WHERE d.event_id = e.id);

-- Projects
INSERT INTO public.discussions (type, project_id)
SELECT 'project', id
FROM public.projects p
WHERE NOT EXISTS (SELECT 1 FROM public.discussions d WHERE d.project_id = p.id);

-- Referendums
INSERT INTO public.discussions (type, referendum_id)
SELECT 'referendum', id
FROM public.referendums r
WHERE NOT EXISTS (SELECT 1 FROM public.discussions d WHERE d.referendum_id = r.id);

-- Profiles (User Walls)
INSERT INTO public.discussions (type, profile_id)
SELECT 'profile', id
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.discussions d WHERE d.profile_id = p.id);

-- Remove deprecated comment column from referendum_votes
-- Users should now use the discussion thread attached to the referendum
ALTER TABLE public.referendum_votes DROP COLUMN comment;
