-- get_forum_stats
--
-- One call that returns everything the forum stats page needs, aggregated in
-- Postgres. The page used to pull every reply and discussion through PostgREST
-- and crunch them client-side, which silently truncated at the 1000 row cap
-- once the forum crossed it. Aggregating here keeps the payload proportional
-- to weeks, users, and topics rather than posts.
--
-- Visibility. The function runs as the caller (security invoker), so the RLS
-- policies on discussions and discussion_replies apply: anon never sees NSFW
-- discussions, drafts are only visible to their author and moderators. On top
-- of that:
--   - drafts are excluded explicitly, so an author or moderator calling this
--     doesn't get their own drafts counted into public numbers
--   - replies are joined to their parent discussion, so a reply only counts
--     when the caller can see the discussion it belongs to. The reply policy on
--     its own only checks the draft flag, which would otherwise let anon count
--     replies on NSFW discussions it can't open
--   - soft-deleted replies are excluded
-- Archived discussions and topics stay in. They're reachable through the
-- "show archived" forum setting, so they're history rather than hidden.
--
-- Shape:
--   totals    { topics, discussions, replies, first_activity_at, last_activity_at }
--   activity  [{ week, discussions, replies }]           week = Monday, UTC
--   starters  [{ user_id, count }]                       discussions per user
--   repliers  [{ user_id, count }]                       replies per user
--   combined  [{ user_id, count }]                       both, per user
--   topics    [{ topic_id, topic_name, discussion_count, reply_count }]
-- User lists are full and sorted by count desc, so the client can slice the
-- podium and still look up the rank of someone outside the top ten. Topics
-- only include those with at least one visible discussion or reply.

CREATE OR REPLACE FUNCTION public.get_forum_stats()
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  WITH
  visible_discussions AS (
    SELECT d.id, d.created_by, d.created_at, d.discussion_topic_id
    FROM public.discussions d
    WHERE d.discussion_topic_id IS NOT NULL
      AND d.is_draft = false
  ),

  visible_replies AS (
    SELECT dr.id, dr.created_by, dr.created_at, d.discussion_topic_id
    FROM public.discussion_replies dr
    INNER JOIN visible_discussions d ON d.id = dr.discussion_id
    WHERE dr.is_deleted = false
  ),

  totals AS (
    SELECT jsonb_build_object(
      'topics',            (SELECT COUNT(*) FROM public.discussion_topics),
      'discussions',       (SELECT COUNT(*) FROM visible_discussions),
      'replies',           (SELECT COUNT(*) FROM visible_replies),
      'first_activity_at', LEAST(
                             (SELECT MIN(created_at) FROM visible_discussions),
                             (SELECT MIN(created_at) FROM visible_replies)
                           ),
      'last_activity_at',  GREATEST(
                             (SELECT MAX(created_at) FROM visible_discussions),
                             (SELECT MAX(created_at) FROM visible_replies)
                           )
    ) AS value
  ),

  -- date_trunc('week') is ISO, so buckets start on Monday. Truncating the UTC
  -- wall time keeps the bucket edges fixed regardless of the session zone.
  weekly AS (
    SELECT
      week,
      SUM(discussions)::int AS discussions,
      SUM(replies)::int     AS replies
    FROM (
      SELECT date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week, 1 AS discussions, 0 AS replies
      FROM visible_discussions
      UNION ALL
      SELECT date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week, 0 AS discussions, 1 AS replies
      FROM visible_replies
    ) points
    GROUP BY week
  ),

  activity AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('week', week, 'discussions', discussions, 'replies', replies)
      ORDER BY week
    ), '[]'::jsonb) AS value
    FROM weekly
  ),

  starter_counts AS (
    SELECT created_by AS user_id, COUNT(*)::int AS count
    FROM visible_discussions
    WHERE created_by IS NOT NULL
    GROUP BY created_by
  ),

  replier_counts AS (
    SELECT created_by AS user_id, COUNT(*)::int AS count
    FROM visible_replies
    WHERE created_by IS NOT NULL
    GROUP BY created_by
  ),

  combined_counts AS (
    SELECT user_id, SUM(count)::int AS count
    FROM (
      SELECT user_id, count FROM starter_counts
      UNION ALL
      SELECT user_id, count FROM replier_counts
    ) both_kinds
    GROUP BY user_id
  ),

  starters AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('user_id', user_id, 'count', count)
      ORDER BY count DESC, user_id
    ), '[]'::jsonb) AS value
    FROM starter_counts
  ),

  repliers AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('user_id', user_id, 'count', count)
      ORDER BY count DESC, user_id
    ), '[]'::jsonb) AS value
    FROM replier_counts
  ),

  combined AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('user_id', user_id, 'count', count)
      ORDER BY count DESC, user_id
    ), '[]'::jsonb) AS value
    FROM combined_counts
  ),

  topic_counts AS (
    SELECT
      dt.id   AS topic_id,
      dt.name AS topic_name,
      (SELECT COUNT(*) FROM visible_discussions vd WHERE vd.discussion_topic_id = dt.id)::int AS discussion_count,
      (SELECT COUNT(*) FROM visible_replies     vr WHERE vr.discussion_topic_id = dt.id)::int AS reply_count
    FROM public.discussion_topics dt
  ),

  topics AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'topic_id',         topic_id,
        'topic_name',       topic_name,
        'discussion_count', discussion_count,
        'reply_count',      reply_count
      )
      ORDER BY (discussion_count + reply_count) DESC, topic_name
    ), '[]'::jsonb) AS value
    FROM topic_counts
    WHERE discussion_count > 0 OR reply_count > 0
  )

  SELECT jsonb_build_object(
    'totals',   (SELECT value FROM totals),
    'activity', (SELECT value FROM activity),
    'starters', (SELECT value FROM starters),
    'repliers', (SELECT value FROM repliers),
    'combined', (SELECT value FROM combined),
    'topics',   (SELECT value FROM topics)
  )
$function$;

COMMENT ON FUNCTION public.get_forum_stats() IS
  'Aggregated forum statistics for the public stats page. Runs as the caller '
  'so RLS applies, and additionally excludes drafts, deleted replies, and '
  'replies whose parent discussion the caller cannot see.';

-- The stats page is public, so anon needs it too. PUBLIC keeps the default
-- EXECUTE grant Postgres gives every new function, which is fine here.
GRANT EXECUTE ON FUNCTION public.get_forum_stats() TO anon, authenticated;
