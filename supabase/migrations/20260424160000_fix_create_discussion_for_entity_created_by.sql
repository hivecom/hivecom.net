-- Fix create_discussion_for_entity to include created_by in the discussion INSERT.
--
-- Migration 20260313163548 (discussion_entity_slug) rewrote this function to add
-- slug generation but accidentally dropped the created_by logic that was added in
-- 20260217120000 (discussion_creator_sync). As a result, all profile discussions
-- are created with created_by = NULL, which causes auto_subscribe_discussion_author
-- to bail out (it guards against NULL created_by) - so profile owners are never
-- subscribed to their own profile discussion.
--
-- This migration restores created_by to the INSERT while keeping slug generation.
-- It also backfills subscriptions for existing profile discussions that were
-- created without a created_by.

CREATE OR REPLACE FUNCTION public.create_discussion_for_entity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  target_col        text  := TG_ARGV[0];
  target_topic_slug text  := TG_ARGV[1];
  found_topic_id    uuid;
  entity_title      text;
  entity_desc       text;
  entity_slug       text;
  entity_created_by uuid;
  new_json          jsonb := to_jsonb(NEW);
BEGIN
  -- Resolve optional topic
  IF target_topic_slug IS NOT NULL THEN
    SELECT id INTO found_topic_id
    FROM public.discussion_topics
    WHERE slug = target_topic_slug;
  END IF;

  -- Extract title (priority: title > name > username)
  IF new_json ? 'title' THEN
    entity_title := new_json ->> 'title';
  ELSIF new_json ? 'name' THEN
    entity_title := new_json ->> 'name';
  ELSIF new_json ? 'username' THEN
    entity_title := new_json ->> 'username';
  END IF;

  -- Extract description (priority: description > introduction)
  IF new_json ? 'description' THEN
    entity_desc := new_json ->> 'description';
  ELSIF new_json ? 'introduction' THEN
    entity_desc := new_json ->> 'introduction';
  END IF;

  -- Build slug for entity types that benefit from one.
  -- Events get a date suffix (natural disambiguator).
  -- Gameservers and projects get a counter suffix on conflict.
  -- Profiles and referendums get no slug.
  IF target_col = 'event_id' AND entity_title IS NOT NULL AND entity_title <> '' THEN
    entity_slug := 'event-'
      || public.slugify(entity_title)
      || '-'
      || to_char((new_json ->> 'date')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD');

  ELSIF target_col = 'gameserver_id' AND entity_title IS NOT NULL AND entity_title <> '' THEN
    entity_slug := public.unique_discussion_slug(
      'gameserver-' || public.slugify(entity_title)
    );

  ELSIF target_col = 'project_id' AND entity_title IS NOT NULL AND entity_title <> '' THEN
    entity_slug := public.unique_discussion_slug(
      'project-' || public.slugify(entity_title)
    );
  END IF;

  -- Determine discussion creator.
  -- For profile-linked discussions the owner is the profile user (NEW.id).
  -- For all other entities it is the created_by field on the record.
  IF target_col = 'profile_id' THEN
    entity_created_by := NEW.id;
  ELSIF new_json ? 'created_by' THEN
    entity_created_by := (new_json ->> 'created_by')::uuid;
  ELSE
    entity_created_by := NULL;
  END IF;

  EXECUTE format(
    'INSERT INTO public.discussions (%I, discussion_topic_id, title, description, slug, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)',
    target_col
  )
  USING NEW.id, found_topic_id, entity_title, entity_desc, entity_slug, entity_created_by;

  RETURN NEW;
END;
$$;

-- Backfill created_by on existing profile discussions that were created with NULL
-- created_by due to the bug above, then subscribe those profile owners.
UPDATE public.discussions d
SET created_by = d.profile_id
WHERE d.profile_id IS NOT NULL
  AND d.created_by IS NULL;

INSERT INTO public.discussion_subscriptions (user_id, discussion_id)
SELECT d.profile_id, d.id
FROM public.discussions d
WHERE d.profile_id IS NOT NULL
ON CONFLICT (user_id, discussion_id) DO NOTHING;
