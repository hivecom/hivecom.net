-- Add prev_cursor_time / prev_cursor_id to get_discussion_reply_page_cursor.
--
-- When the target reply is on page N >= 2, the caller needs both the cursor
-- for page N (already returned as cursor_time/cursor_id) AND the cursor for
-- page N-1 so it can preload two pages of context:
--   page N-1  ->  comments immediately before the target
--   page N    ->  the target itself + surrounding comments
--
-- The prev cursor is the last item of page (N-2), i.e. at
--   OFFSET GREATEST(0, (pg-1) * p_limit - 1)
-- It is NULL when pg < 2 (target on page 0 or 1, no preceding page needed
-- because page 1 is always loaded as the "early block").

DROP FUNCTION IF EXISTS public.get_discussion_reply_page_cursor(uuid, uuid, int, boolean, text, boolean);

CREATE OR REPLACE FUNCTION public.get_discussion_reply_page_cursor(
  p_discussion_id  uuid,
  p_target_id      uuid,
  p_limit          int         DEFAULT 25,
  p_ascending      boolean     DEFAULT true,
  p_hash           text        DEFAULT NULL,
  p_root_only      boolean     DEFAULT false
)
RETURNS TABLE (
  page_index         int,
  predecessor_count  int,
  cursor_time        timestamptz,
  cursor_id          uuid,
  prev_cursor_time   timestamptz,
  prev_cursor_id     uuid
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH target AS (
    SELECT dr.created_at, dr.id
    FROM discussion_replies dr
    WHERE dr.id            = p_target_id
      AND dr.discussion_id = p_discussion_id
      AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
      AND (NOT p_root_only OR dr.reply_to_id IS NULL)
  ),
  page_info AS (
    SELECT
      COUNT(dr.id)::int                      AS predecessor_count,
      (COUNT(dr.id)::int / p_limit)::int     AS pg
    FROM target t
    LEFT JOIN discussion_replies dr ON
        dr.discussion_id = p_discussion_id
        AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
        AND (NOT p_root_only OR dr.reply_to_id IS NULL)
        AND (
          (
            p_ascending
            AND (
              dr.created_at < t.created_at
              OR (dr.created_at = t.created_at AND dr.id < t.id)
            )
          )
          OR (
            NOT p_ascending
            AND (
              dr.created_at > t.created_at
              OR (dr.created_at = t.created_at AND dr.id > t.id)
            )
          )
        )
    GROUP BY t.created_at, t.id
  )
  SELECT
    pi.pg               AS page_index,
    pi.predecessor_count,
    lb.created_at       AS cursor_time,
    lb.id               AS cursor_id,
    lb2.created_at      AS prev_cursor_time,
    lb2.id              AS prev_cursor_id
  FROM page_info pi
  LEFT JOIN LATERAL (
    -- Cursor for the START of page N (last item of page N-1).
    SELECT dr.created_at, dr.id
    FROM discussion_replies dr
    WHERE pi.pg > 0
      AND dr.discussion_id = p_discussion_id
      AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
      AND (NOT p_root_only OR dr.reply_to_id IS NULL)
    ORDER BY
      CASE WHEN p_ascending     THEN dr.created_at END ASC,
      CASE WHEN p_ascending     THEN dr.id         END ASC,
      CASE WHEN NOT p_ascending THEN dr.created_at END DESC,
      CASE WHEN NOT p_ascending THEN dr.id         END DESC
    OFFSET GREATEST(0, pi.pg * p_limit - 1)
    LIMIT 1
  ) lb ON true
  LEFT JOIN LATERAL (
    -- Cursor for the START of page N-1 (last item of page N-2).
    -- Only useful when pg >= 2; returns NULL otherwise.
    SELECT dr.created_at, dr.id
    FROM discussion_replies dr
    WHERE pi.pg >= 2
      AND dr.discussion_id = p_discussion_id
      AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
      AND (NOT p_root_only OR dr.reply_to_id IS NULL)
    ORDER BY
      CASE WHEN p_ascending     THEN dr.created_at END ASC,
      CASE WHEN p_ascending     THEN dr.id         END ASC,
      CASE WHEN NOT p_ascending THEN dr.created_at END DESC,
      CASE WHEN NOT p_ascending THEN dr.id         END DESC
    OFFSET GREATEST(0, (pi.pg - 1) * p_limit - 1)
    LIMIT 1
  ) lb2 ON true
$$;

GRANT EXECUTE ON FUNCTION public.get_discussion_reply_page_cursor(uuid, uuid, int, boolean, text, boolean)
  TO authenticated, anon;
