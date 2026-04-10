-- Timeline navigation RPC.
--
-- Adds one RPC:
--
--   get_discussion_reply_nearest_to_date
--     Given a target timestamp, returns the id of the reply closest to
--     (but not after) that timestamp. Used by the front-end timeline scrubber
--     to resolve a clicked date into a reply id that can be passed to the
--     existing navigateToComment flow.
--
--     For ascending order (forum): returns the last reply with
--     created_at <= p_target_time. Falls back to the earliest reply if
--     the target predates all replies (e.g. the user dragged to the very top).
--
--     For descending order (comment): returns the first reply with
--     created_at >= p_target_time. Falls back to the latest reply if
--     the target is newer than all replies.
--
-- SECURITY INVOKER - the caller's RLS context applies.

CREATE OR REPLACE FUNCTION public.get_discussion_reply_nearest_to_date(
  p_discussion_id  uuid,
  p_target_time    timestamptz,
  p_ascending      boolean     DEFAULT true,
  p_hash           text        DEFAULT NULL,
  p_root_only      boolean     DEFAULT false
)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  -- Primary: closest reply on the "before" side of the target (direction-aware).
  -- Secondary: absolute first/last reply as a fallback when the target is
  --            outside the range of the discussion.
  -- UNION ALL + outer LIMIT 1 means the fallback is only evaluated when the
  -- primary returns no rows.
  (
    SELECT dr.id
    FROM public.discussion_replies dr
    WHERE dr.discussion_id = p_discussion_id
      AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
      AND (NOT p_root_only OR dr.reply_to_id IS NULL)
      AND (
        -- Ascending (forum): find the latest reply at or before the target.
        (p_ascending = true  AND dr.created_at <= p_target_time)
        OR
        -- Descending (comment): find the earliest reply at or after the target.
        (p_ascending = false AND dr.created_at >= p_target_time)
      )
    ORDER BY
      CASE WHEN p_ascending     THEN dr.created_at END DESC,
      CASE WHEN p_ascending     THEN dr.id         END DESC,
      CASE WHEN NOT p_ascending THEN dr.created_at END ASC,
      CASE WHEN NOT p_ascending THEN dr.id         END ASC
    LIMIT 1
  )
  UNION ALL
  (
    -- Fallback: first reply in sort order (handles out-of-range targets).
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

GRANT EXECUTE ON FUNCTION public.get_discussion_reply_nearest_to_date(uuid, timestamptz, boolean, text, boolean)
  TO authenticated, anon;
