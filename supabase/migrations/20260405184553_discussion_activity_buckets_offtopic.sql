-- Extends get_discussion_reply_activity_buckets with a p_offtopic_only filter.
--
-- The existing 4-arg signature is dropped first so Postgres does not treat the
-- new 5-arg version as an overload - we want a clean replacement.
--
-- New parameter:
--   p_offtopic_only: when true, only counts replies where is_offtopic = true.
--     Used by the front-end to render a second overlaid segment layer on the
--     timeline scrubber so users can see where off-topic content is concentrated
--     before they choose to load it.
--
-- All other behaviour is unchanged.
--
-- SECURITY INVOKER - the caller's RLS context applies.

DROP FUNCTION IF EXISTS public.get_discussion_reply_activity_buckets(uuid, text, text, boolean);

CREATE OR REPLACE FUNCTION public.get_discussion_reply_activity_buckets(
  p_discussion_id  uuid,
  p_bucket_size    text        DEFAULT '1 day',
  p_hash           text        DEFAULT NULL,
  p_root_only      boolean     DEFAULT false,
  p_offtopic_only  boolean     DEFAULT false
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
    AND (NOT p_offtopic_only OR dr.is_offtopic = true)
  GROUP BY date_bin(p_bucket_size::interval, dr.created_at, TIMESTAMPTZ '2000-01-01')
  ORDER BY bucket_start ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_discussion_reply_activity_buckets(uuid, text, text, boolean, boolean)
  TO authenticated, anon;
