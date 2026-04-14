CREATE OR REPLACE FUNCTION public.get_forum_activity_feed_today_count(
  p_exclude uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::integer FROM (
    SELECT dr.id
    FROM discussion_replies dr
    WHERE dr.is_forum_reply = true
      AND dr.is_offtopic    = false
      AND dr.is_deleted     = false
      AND dr.created_at     > now() - interval '24 hours'
      AND (p_exclude IS NULL OR dr.created_by <> p_exclude)

    UNION ALL

    SELECT d.id
    FROM discussions d
    WHERE d.discussion_topic_id IS NOT NULL
      AND d.is_draft    = false
      AND d.is_archived = false
      AND d.created_at  > now() - interval '24 hours'
      AND (p_exclude IS NULL OR d.created_by <> p_exclude)

    UNION ALL

    SELECT dt.id
    FROM discussion_topics dt
    WHERE dt.is_archived = false
      AND dt.created_at  > now() - interval '24 hours'
      AND (p_exclude IS NULL OR dt.created_by <> p_exclude)
  ) activity
$$;
