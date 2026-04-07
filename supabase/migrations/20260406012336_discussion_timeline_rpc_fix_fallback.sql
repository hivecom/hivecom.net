-- Fix get_discussion_reply_nearest_to_date fallback behaviour.
--
-- Previously, when the primary query returned no rows (e.g. the bucket_start
-- timestamp passed as p_target_time is slightly after the last reply in the
-- discussion, due to date_bin rounding), the UNION ALL fallback returned the
-- absolute first reply in natural sort order. This caused timeline dot clicks
-- to jump to the very top of the discussion instead of the nearest reply.
--
-- Fix: replace the single absolute-first fallback with two fallbacks tried in
-- order via UNION ALL + outer LIMIT 1:
--
--   Fallback 1 - nearest in the OPPOSITE direction from the primary.
--     If the primary was ceiling (>= target), try floor (<= target) to find
--     the closest reply just before the target. This handles the common case
--     where the bucket_start is 1ms after the actual reply timestamp.
--     If the primary was floor, try ceiling instead.
--
--   Fallback 2 - absolute first/last reply (original safety net).
--     Only reached when both directions have no qualifying rows, i.e. the
--     discussion has no replies at all (should never happen in practice).
--
-- All other behaviour is unchanged.

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
  -- Primary: ceiling or floor depending on p_ascending / p_find_first.
  --
  -- Truth table (want_ceil = p_ascending XOR NOT p_find_first):
  --
  --   p_ascending | p_find_first | primary mode
  --   -------------------------------------------
  --   true        | false        | floor  (default ascending - last reply <= target)
  --   true        | true         | ceil   (segment click   - first reply >= target)
  --   false       | false        | ceil   (default descending)
  --   false       | true         | floor  (segment click descending)
  (
    SELECT dr.id
    FROM public.discussion_replies dr
    WHERE dr.discussion_id = p_discussion_id
      AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
      AND (NOT p_root_only OR dr.reply_to_id IS NULL)
      AND (
        ((p_ascending = p_find_first) AND dr.created_at >= p_target_time)
        OR
        ((p_ascending != p_find_first) AND dr.created_at <= p_target_time)
      )
    ORDER BY
      CASE WHEN (p_ascending = p_find_first) THEN dr.created_at END ASC,
      CASE WHEN (p_ascending = p_find_first) THEN dr.id         END ASC,
      CASE WHEN (p_ascending != p_find_first) THEN dr.created_at END DESC,
      CASE WHEN (p_ascending != p_find_first) THEN dr.id         END DESC
    LIMIT 1
  )
  UNION ALL
  -- Fallback 1: try the opposite direction so we land on the nearest reply
  -- when the primary direction has no qualifying rows (e.g. bucket_start is
  -- fractionally after the only reply in that bucket).
  (
    SELECT dr.id
    FROM public.discussion_replies dr
    WHERE dr.discussion_id = p_discussion_id
      AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
      AND (NOT p_root_only OR dr.reply_to_id IS NULL)
      AND (
        -- Opposite of primary: swap the ceiling/floor condition.
        ((p_ascending != p_find_first) AND dr.created_at >= p_target_time)
        OR
        ((p_ascending = p_find_first) AND dr.created_at <= p_target_time)
      )
    ORDER BY
      -- Order toward the target so we get the closest reply, not the furthest.
      CASE WHEN (p_ascending != p_find_first) THEN dr.created_at END ASC,
      CASE WHEN (p_ascending != p_find_first) THEN dr.id         END ASC,
      CASE WHEN (p_ascending = p_find_first) THEN dr.created_at END DESC,
      CASE WHEN (p_ascending = p_find_first) THEN dr.id         END DESC
    LIMIT 1
  )
  UNION ALL
  -- Fallback 2: absolute safety net - first reply in natural sort order.
  -- Only reached when the discussion has no replies at all.
  (
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

-- Re-grant on both signatures so the fix is accessible to all callers.
GRANT EXECUTE ON FUNCTION public.get_discussion_reply_nearest_to_date(uuid, timestamptz, boolean, text, boolean)
  TO authenticated, anon;

GRANT EXECUTE ON FUNCTION public.get_discussion_reply_nearest_to_date(uuid, timestamptz, boolean, text, boolean, boolean)
  TO authenticated, anon;
