-- Fix negative OFFSET in get_discussion_reply_page_cursor.
--
-- When the target reply is on page 0, pi.pg = 0, which caused the lateral
-- subquery to evaluate OFFSET 0 * p_limit - 1 = -1. PostgreSQL validates
-- OFFSET before executing the scan, so it threw:
--   ERROR 2201X: OFFSET must not be negative
-- even though the WHERE pi.pg > 0 guard would have returned 0 rows anyway.
--
-- Fix: wrap the OFFSET expression with GREATEST(0, ...) so the value is
-- always non-negative. The WHERE pi.pg > 0 guard already ensures the lateral
-- returns no rows when pg = 0, so the GREATEST(0, ...) value is never
-- actually used to skip rows in that case - it just satisfies the validator.

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
  cursor_id          uuid
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
    lb.id               AS cursor_id
  FROM page_info pi
  LEFT JOIN LATERAL (
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
    -- GREATEST(0, ...) prevents the negative-OFFSET error when pg = 0.
    -- The WHERE pi.pg > 0 guard above ensures no row is returned in that
    -- case; the clamped value is never actually used to skip rows.
    OFFSET GREATEST(0, pi.pg * p_limit - 1)
    LIMIT 1
  ) lb ON true
$$;

GRANT EXECUTE ON FUNCTION public.get_discussion_reply_page_cursor(uuid, uuid, int, boolean, text, boolean)
  TO authenticated, anon;
