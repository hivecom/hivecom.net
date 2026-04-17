-- Extend the entity check constraint to include theme_id
ALTER TABLE public.discussions
  DROP CONSTRAINT discussions_title_check;

ALTER TABLE public.discussions
  ADD CONSTRAINT discussions_title_check
    CHECK (
      (num_nonnulls(event_id, referendum_id, profile_id, project_id, gameserver_id, theme_id) > 0)
      OR (title IS NOT NULL)
    );

-- Backfill discussions for themes that don't have one yet
INSERT INTO public.discussions (theme_id)
SELECT t.id
FROM public.themes t
LEFT JOIN public.discussions d ON d.theme_id = t.id
WHERE d.id IS NULL;
