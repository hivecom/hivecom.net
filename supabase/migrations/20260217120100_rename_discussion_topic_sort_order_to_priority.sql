-- Rename discussion topic ordering column to priority and update default priorities

ALTER TABLE public.discussion_topics
  RENAME COLUMN sort_order TO priority;

-- Re-order default topics so higher priority appears higher in forum lists
UPDATE public.discussion_topics
SET priority = CASE slug
  WHEN 'announcements' THEN 100
  WHEN 'events' THEN 80
  WHEN 'general' THEN 60
  WHEN 'projects' THEN 0
  ELSE priority
END
WHERE slug IN ('announcements', 'events', 'general', 'projects');
