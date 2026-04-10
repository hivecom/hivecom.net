-- Activity bucket aggregation for discussion timeline.
--
-- Adds one RPC:
--
--   get_discussion_reply_activity_buckets
--     Groups replies for a discussion into fixed-size time buckets and returns
--     the count per bucket. Used by the front-end timeline scrubber to render
--     density markers so users can see where activity is concentrated.
--
--     Bucket size is passed as a PostgreSQL interval string (e.g. '1 hour',
--     '6 hours', '1 day'). The front-end picks the granularity based on the
--     total span of the discussion:
--       span >= 30 days  →  '1 day'
--       span >= 7 days   →  '6 hours'
--       span >= 1 day    →  '1 hour'
--
--     Results are ordered ascending by bucket_start. Empty buckets are not
--     returned (only buckets that contain at least one reply).
--
-- SECURITY INVOKER - the caller's RLS context applies; replies the user
-- cannot normally read will not appear in any bucket.

CREATE OR REPLACE FUNCTION public.get_discussion_reply_activity_buckets(
  p_discussion_id  uuid,
  p_bucket_size    text        DEFAULT '1 day',
  p_hash           text        DEFAULT NULL,
  p_root_only      boolean     DEFAULT false
)
RETURNS TABLE (
  bucket_start  timestamptz,
  reply_count   bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    date_trunc('second', date_bin(p_bucket_size::interval, dr.created_at, TIMESTAMPTZ '2000-01-01')) AS bucket_start,
    COUNT(*)::bigint AS reply_count
  FROM public.discussion_replies dr
  WHERE dr.discussion_id = p_discussion_id
    AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
    AND (NOT p_root_only OR dr.reply_to_id IS NULL)
  GROUP BY date_bin(p_bucket_size::interval, dr.created_at, TIMESTAMPTZ '2000-01-01')
  ORDER BY bucket_start ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_discussion_reply_activity_buckets(uuid, text, text, boolean)
  TO authenticated, anon;
