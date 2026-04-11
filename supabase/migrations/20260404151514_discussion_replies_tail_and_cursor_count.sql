-- Two additions to the discussion replies pagination system.
--
--   get_discussion_replies_tail
--     Returns the last p_limit rows for a discussion in ascending order
--     (i.e. the tail/newest end of the thread). Used by the front-end to
--     always show the latest content without the user having to page through
--     the entire history. The caller detects whether a gap exists between
--     page 1 and the tail by comparing IDs.
--
--   get_discussion_reply_page_cursor (updated)
--     Same signature as before but now also returns predecessor_count - the
--     number of replies that sort before the target. The front-end uses this
--     to compute how many replies sit in the gap between the first loaded
--     block and the deep-linked page.
--
-- Both functions are SECURITY INVOKER so the caller's RLS context applies.

-- ---------------------------------------------------------------------------
-- get_discussion_replies_tail
-- ---------------------------------------------------------------------------
-- Returns the last p_limit rows for a discussion in ascending order.
--
-- Implemented as a descending fetch limited to p_limit rows, then re-sorted
-- ascending, so only p_limit rows are ever scanned from the index tail.
--
-- Parameters:
--   p_discussion_id  uuid     - the discussion to query
--   p_limit          int      - how many tail rows to return
--   p_hash           text     - optional meta->>'hash' filter (vote discussions)
--   p_root_only      boolean  - when true, only top-level replies
--                               (reply_to_id IS NULL); used for threaded mode
--
-- Returns the same column set as get_discussion_replies_page minus has_more,
-- sorted ascending (oldest of the tail first).

CREATE OR REPLACE FUNCTION public.get_discussion_replies_tail(
  p_discussion_id  uuid,
  p_limit          int         DEFAULT 25,
  p_hash           text        DEFAULT NULL,
  p_root_only      boolean     DEFAULT false
)
RETURNS TABLE (
  id              uuid,
  discussion_id   uuid,
  created_by      uuid,
  created_at      timestamptz,
  modified_at     timestamptz,
  modified_by     uuid,
  reply_to_id     uuid,
  markdown        text,
  is_deleted      boolean,
  is_forum_reply  boolean,
  is_nsfw         boolean,
  is_offtopic     boolean,
  reactions       jsonb,
  meta            jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  -- Fetch the last p_limit rows descending, then re-sort ascending so the
  -- caller always receives rows in chronological order regardless of how
  -- they were retrieved internally.
  SELECT
    t.id, t.discussion_id, t.created_by, t.created_at,
    t.modified_at, t.modified_by, t.reply_to_id, t.markdown,
    t.is_deleted, t.is_forum_reply, t.is_nsfw, t.is_offtopic,
    t.reactions, t.meta
  FROM (
    SELECT
      dr.id, dr.discussion_id, dr.created_by, dr.created_at,
      dr.modified_at, dr.modified_by, dr.reply_to_id, dr.markdown,
      dr.is_deleted, dr.is_forum_reply, dr.is_nsfw, dr.is_offtopic,
      dr.reactions, dr.meta
    FROM discussion_replies dr
    WHERE dr.discussion_id = p_discussion_id
      AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
      AND (NOT p_root_only OR dr.reply_to_id IS NULL)
    ORDER BY dr.created_at DESC, dr.id DESC
    LIMIT p_limit
  ) t
  ORDER BY t.created_at ASC, t.id ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_discussion_replies_tail(uuid, int, text, boolean)
  TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- get_discussion_reply_page_cursor (updated)
-- ---------------------------------------------------------------------------
-- Adds predecessor_count to the return type. All other behaviour is
-- identical to the version created in 20260404075704.
--
-- predecessor_count is the number of replies that sort before the target
-- in the requested order. The front-end uses it to compute the size of any
-- gap between the first loaded block and the deep-linked page:
--   gap_count = predecessor_count - first_page_row_count

-- DROP required because CREATE OR REPLACE cannot change a function's return type.
-- The previous version (20260404075704) returned 3 columns; this version adds
-- predecessor_count as a 4th column.
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
    -- LEFT JOIN from target so that when the target does not exist the CTE
    -- returns no rows, causing the function to return nothing ("not found").
    -- COUNT(dr.id) counts only non-NULL joined rows; 0 is correct when the
    -- target is the very first reply in the ordered set.
    SELECT
      COUNT(dr.id)::int                        AS predecessor_count,
      (COUNT(dr.id)::int / p_limit)::int       AS pg
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
    pi.pg                AS page_index,
    pi.predecessor_count AS predecessor_count,
    lb.created_at        AS cursor_time,
    lb.id                AS cursor_id
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
    OFFSET pi.pg * p_limit - 1
    LIMIT 1
  ) lb ON true
$$;

GRANT EXECUTE ON FUNCTION public.get_discussion_reply_page_cursor(uuid, uuid, int, boolean, text, boolean)
  TO authenticated, anon;
