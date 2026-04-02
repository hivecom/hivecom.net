-- Unified paginated forum activity feed.
-- Returns topics, discussions, and replies interleaved in chronological order.
-- Filtering of archived/nsfw content is intentionally left to the caller since
-- those preferences are per-user and not available server-side without auth context.
CREATE OR REPLACE FUNCTION get_forum_activity_feed(
  p_limit  int DEFAULT 30,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
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
SECURITY INVOKER
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

  ORDER BY created_at DESC
  LIMIT  p_limit
  OFFSET p_offset
$$;

-- Authenticated users only - this is a power-user feature (RLS on underlying tables still applies)
GRANT EXECUTE ON FUNCTION get_forum_activity_feed(int, int) TO authenticated;
