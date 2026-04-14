DROP FUNCTION IF EXISTS public.get_forum_activity_feed(integer, integer, uuid);

CREATE OR REPLACE FUNCTION public.get_forum_activity_feed(
  p_limit      integer DEFAULT 30,
  p_offset     integer DEFAULT 0,
  p_created_by uuid    DEFAULT NULL,
  p_exclude    uuid    DEFAULT NULL
)
RETURNS TABLE(
  id            uuid,
  item_type     text,
  discussion_id uuid,
  title         text,
  body          text,
  is_nsfw       boolean,
  is_offtopic   boolean,
  created_at    timestamptz,
  created_by    uuid
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    dr.id,
    'reply'::text          AS item_type,
    dr.discussion_id,
    NULL::text             AS title,
    dr.markdown            AS body,
    dr.is_nsfw,
    dr.is_offtopic,
    dr.created_at,
    dr.created_by
  FROM discussion_replies dr
  WHERE dr.is_forum_reply = true
    AND dr.is_offtopic    = false
    AND dr.is_deleted     = false
    AND (p_created_by IS NULL OR dr.created_by = p_created_by)
    AND (p_exclude    IS NULL OR dr.created_by <> p_exclude)

  UNION ALL

  SELECT
    d.id,
    'discussion'::text     AS item_type,
    d.discussion_topic_id  AS discussion_id,
    d.title,
    d.description          AS body,
    d.is_nsfw,
    false                  AS is_offtopic,
    d.created_at,
    d.created_by
  FROM discussions d
  WHERE d.discussion_topic_id IS NOT NULL
    AND d.is_draft    = false
    AND d.is_archived = false
    AND (p_created_by IS NULL OR d.created_by = p_created_by)
    AND (p_exclude    IS NULL OR d.created_by <> p_exclude)

  UNION ALL

  SELECT
    dt.id,
    'topic'::text          AS item_type,
    NULL::uuid             AS discussion_id,
    dt.name                AS title,
    dt.description         AS body,
    false                  AS is_nsfw,
    false                  AS is_offtopic,
    dt.created_at,
    dt.created_by
  FROM discussion_topics dt
  WHERE dt.is_archived = false
    AND (p_created_by IS NULL OR dt.created_by = p_created_by)
    AND (p_exclude    IS NULL OR dt.created_by <> p_exclude)

  ORDER BY created_at DESC
  LIMIT  p_limit
  OFFSET p_offset
$$;
