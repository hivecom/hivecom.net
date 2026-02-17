-- Ensure discussions inherit creator ownership from their parent entities.

-- 1) Backfill existing discussions where the linked entity has a creator.
UPDATE public.discussions d
SET created_by = e.created_by
FROM public.events e
WHERE d.event_id = e.id
  AND d.created_by IS DISTINCT FROM e.created_by;

UPDATE public.discussions d
SET created_by = r.created_by
FROM public.referendums r
WHERE d.referendum_id = r.id
  AND d.created_by IS DISTINCT FROM r.created_by;

UPDATE public.discussions d
SET created_by = p.id
FROM public.profiles p
WHERE d.profile_id = p.id
  AND d.created_by IS DISTINCT FROM p.id;

UPDATE public.discussions d
SET created_by = pr.created_by
FROM public.projects pr
WHERE d.project_id = pr.id
  AND d.created_by IS DISTINCT FROM pr.created_by;

UPDATE public.discussions d
SET created_by = gs.created_by
FROM public.gameservers gs
WHERE d.gameserver_id = gs.id
  AND d.created_by IS DISTINCT FROM gs.created_by;

-- 2) Update trigger function so new discussions copy creator from parent entity.
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
    'INSERT INTO public.discussions (%I, discussion_topic_id, title, description, created_by) VALUES ($1, $2, $3, $4, $5)',
    target_col
  )
  USING NEW.id, found_topic_id, entity_title, entity_desc, entity_created_by;

  RETURN NEW;
END;
$$;
