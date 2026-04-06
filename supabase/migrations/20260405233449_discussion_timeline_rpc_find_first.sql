-- Update get_discussion_reply_nearest_to_date to support "ceiling" mode.
--
-- Adds p_find_first boolean DEFAULT false:
--
--   p_find_first = false (default, existing behaviour):
--     Ascending:  last reply with created_at <= p_target_time  (floor)
--     Descending: first reply with created_at >= p_target_time (ceiling)
--
--   p_find_first = true (new, used by timeline segment clicks):
--     Ascending:  first reply with created_at >= p_target_time (ceiling)
--     Descending: last reply with created_at <= p_target_time  (floor)
--
-- The ceiling mode is needed so that clicking a timeline segment navigates
-- to the FIRST reply in that segment rather than the last one.  Previously
-- the front-end worked around this by passing firstBucketStart + intervalMs
-- as the target, but "last reply at-or-before bucket-end" still picks the
-- final reply when multiple replies share the same bucket.
--
-- The existing GRANT covers the old signature; we must re-GRANT for the new
-- one that adds the extra parameter.

CREATE OR REPLACE FUNCTION public.get_discussion_reply_nearest_to_date(
  p_discussion_id  uuid,
  p_target_time    timestamptz,
  p_ascending      boolean     DEFAULT true,
  p_hash           text        DEFAULT NULL,
  p_root_only      boolean     DEFAULT false,
  p_find_first     boolean     DEFAULT false
)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  -- p_find_first flips the direction used to locate the nearest reply so that
  -- we always get the reply closest to the START of the target window rather
  -- than the end.
  --
  -- Truth table (want_ceil = p_find_first XOR NOT p_ascending):
  --
  --   p_ascending | p_find_first | mode
  --   ------------------------------------
  --   true        | false        | floor  (ascending default)
  --   true        | true         | ceil   (segment-start click)
  --   false       | false        | ceil   (descending default)
  --   false       | true         | floor  (descending segment-start)
  --
  -- "ceil"  = first reply with created_at >= target, ordered ASC
  -- "floor" = last  reply with created_at <= target, ordered DESC
  (
    SELECT dr.id
    FROM public.discussion_replies dr
    WHERE dr.discussion_id = p_discussion_id
      AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
      AND (NOT p_root_only OR dr.reply_to_id IS NULL)
      AND (
        -- Ceiling mode: first reply at or after the target.
        ((p_ascending = p_find_first) AND dr.created_at >= p_target_time)
        OR
        -- Floor mode: last reply at or before the target.
        ((p_ascending != p_find_first) AND dr.created_at <= p_target_time)
      )
    ORDER BY
      -- Ceiling branch: order ASC to get the earliest qualifying reply.
      CASE WHEN (p_ascending = p_find_first) THEN dr.created_at END ASC,
      CASE WHEN (p_ascending = p_find_first) THEN dr.id         END ASC,
      -- Floor branch: order DESC to get the latest qualifying reply.
      CASE WHEN (p_ascending != p_find_first) THEN dr.created_at END DESC,
      CASE WHEN (p_ascending != p_find_first) THEN dr.id         END DESC
    LIMIT 1
  )
  UNION ALL
  (
    -- Fallback: absolute first reply in natural sort order when the primary
    -- returns nothing (target outside the discussion's time range).
    SELECT dr.id
    FROM public.discussion_replies dr
    WHERE dr.discussion_id = p_discussion_id
      AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
      AND (NOT p_root_only OR dr.reply_to_id IS NULL)
    ORDER BY
      CASE WHEN p_ascending     THEN dr.created_at END ASC,
      CASE WHEN p_ascending     THEN dr.id         END ASC,
      CASE WHEN NOT p_ascending THEN dr.created_at END DESC,
      CASE WHEN NOT p_ascending THEN dr.id         END DESC
    LIMIT 1
  )
  LIMIT 1
$$;

-- The old 5-argument signature still exists and still works (Postgres keeps it
-- separately).  Grant on the new 6-argument variant.
GRANT EXECUTE ON FUNCTION public.get_discussion_reply_nearest_to_date(uuid, timestamptz, boolean, text, boolean, boolean)
  TO authenticated, anon;
