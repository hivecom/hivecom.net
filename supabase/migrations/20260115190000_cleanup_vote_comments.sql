-- Seed base discussion topics
INSERT INTO public.discussion_topics (name, slug, description, sort_order, is_locked)
VALUES
  ('Announcements', 'announcements', 'Official news and updates from Hivecom.', 10, true),
  ('Events', 'events', 'Community events and gatherings.', 20, true),
  ('Projects', 'projects', 'Showcase and discussion of community projects.', 30, true),
  ('General', 'general', 'General discussion about anything and everything.', 50, false)
ON CONFLICT (slug) DO NOTHING;

-- Backfill discussions for existing entities so they can be commented on immediately
-- This ensures the new system works for historical data

-- Announcements (linked to Announcements topic)
INSERT INTO public.discussions (announcement_id, discussion_topic_id)
SELECT id, (SELECT id FROM public.discussion_topics WHERE slug = 'announcements')
FROM public.announcements a
WHERE NOT EXISTS (SELECT 1 FROM public.discussions d WHERE d.announcement_id = a.id);

-- Events (linked to Events topic)
INSERT INTO public.discussions (event_id, discussion_topic_id)
SELECT id, (SELECT id FROM public.discussion_topics WHERE slug = 'events')
FROM public.events e
WHERE NOT EXISTS (SELECT 1 FROM public.discussions d WHERE d.event_id = e.id);

-- Projects (linked to Projects topic)
INSERT INTO public.discussions (project_id, discussion_topic_id)
SELECT id, (SELECT id FROM public.discussion_topics WHERE slug = 'projects')
FROM public.projects p
WHERE NOT EXISTS (SELECT 1 FROM public.discussions d WHERE d.project_id = p.id);

-- Profiles (User Walls) - Not linked to a topic
INSERT INTO public.discussions (profile_id)
SELECT id
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.discussions d WHERE d.profile_id = p.id);

-- Gameservers (unlinked)
INSERT INTO public.discussions (gameserver_id)
SELECT id
FROM public.gameservers g
WHERE NOT EXISTS (SELECT 1 FROM public.discussions d WHERE d.gameserver_id = g.id);

-- Remove deprecated comment column from referendum_votes
-- Users should now use the discussion thread attached to the referendum
ALTER TABLE public.referendum_votes DROP COLUMN comment;
