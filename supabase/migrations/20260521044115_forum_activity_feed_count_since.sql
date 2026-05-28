-- get_forum_activity_feed_count_since
-- Mirrors get_forum_activity_feed_today_count but with a caller-supplied
-- lower bound. Used by the forum activity feed to compute an accurate
-- "since last visit" count that isn't bounded by the rendered carousel slice
-- (which is capped at 16 items) or by the latest-replies fetch (capped at 30).

CREATE OR REPLACE FUNCTION public.get_forum_activity_feed_count_since(
  p_since timestamptz,
  p_exclude uuid DEFAULT NULL::uuid
)
RETURNS integer
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_since IS NULL THEN 0
    ELSE (
      SELECT COUNT(*)::integer FROM (
        SELECT dr.id
        FROM public.discussion_replies dr
        WHERE dr.is_forum_reply = true
          AND dr.is_offtopic    = false
          AND dr.is_deleted     = false
          AND dr.created_at     > p_since
          AND (p_exclude IS NULL OR dr.created_by <> p_exclude)

        UNION ALL

        SELECT d.id
        FROM public.discussions d
        WHERE d.discussion_topic_id IS NOT NULL
          AND d.is_draft    = false
          AND d.is_archived = false
          AND d.created_at  > p_since
          AND (p_exclude IS NULL OR d.created_by <> p_exclude)

        UNION ALL

        SELECT dt.id
        FROM public.discussion_topics dt
        WHERE dt.is_archived = false
          AND dt.created_at  > p_since
          AND (p_exclude IS NULL OR dt.created_by <> p_exclude)
      ) activity
    )
  END
$function$;
