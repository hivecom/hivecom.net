-- Cursor-based pagination for discussion replies.
--
-- Adds two RPCs:
--
--   get_discussion_replies_page
--     Returns one page of replies for a discussion using a (created_at, id)
--     composite cursor. Works for both ascending (forum) and descending
--     (comment) sort orders. Returns at most p_limit rows plus a boolean
--     indicating whether more rows exist beyond this page.
--
--   get_discussion_reply_page_cursor
--     Given a target reply id, returns the composite cursor
--     (cursor_created_at, cursor_id) for the page that contains that reply,
--     along with its 0-based page index. Used by the front-end to jump
--     directly to the right page when following a ?comment=<id> deep link.
--
-- Both functions are SECURITY INVOKER so the caller's RLS context applies -
-- no reply that the user cannot normally read will be returned here either.

-- ---------------------------------------------------------------------------
-- get_discussion_replies_page
-- ---------------------------------------------------------------------------
-- Returns a page of discussion_replies rows ordered by (created_at, id).
--
-- Parameters:
--   p_discussion_id  uuid       - the discussion to paginate
--   p_limit          int        - page size (e.g. 25 for forum, 50 for comments)
--   p_ascending      boolean    - true = forum order (oldest first),
--                                 false = comment order (newest first)
--   p_cursor_time    timestamptz - exclusive lower/upper bound on created_at;
--                                  NULL fetches the first page
--   p_cursor_id      uuid       - id tie-breaker paired with p_cursor_time;
--                                  NULL fetches the first page
--   p_hash           text       - optional meta->>'hash' filter for vote discussions
--   p_root_only      boolean    - when true, return only top-level replies
--                                 (reply_to_id IS NULL); used for threaded-mode
--                                 pagination where children are loaded lazily
--
-- Returns rows from discussion_replies plus a synthetic `has_more` boolean
-- column on the last row (true when a subsequent page exists).
-- Callers should read `has_more` from the last row of the result set.

CREATE OR REPLACE FUNCTION public.get_discussion_replies_page(
  p_discussion_id  uuid,
  p_limit          int          DEFAULT 25,
  p_ascending      boolean      DEFAULT true,
  p_cursor_time    timestamptz  DEFAULT NULL,
  p_cursor_id      uuid         DEFAULT NULL,
  p_hash           text         DEFAULT NULL,
  p_root_only      boolean      DEFAULT false
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
  meta            jsonb,
  has_more        boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH page AS (
    SELECT
      dr.id,
      dr.discussion_id,
      dr.created_by,
      dr.created_at,
      dr.modified_at,
      dr.modified_by,
      dr.reply_to_id,
      dr.markdown,
      dr.is_deleted,
      dr.is_forum_reply,
      dr.is_nsfw,
      dr.is_offtopic,
      dr.reactions,
      dr.meta
    FROM discussion_replies dr
    WHERE dr.discussion_id = p_discussion_id
      -- Hash filter for vote discussions (meta->>'hash')
      AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
      -- Root-only filter: threaded mode paginates top-level replies only;
      -- children are loaded lazily per root via a separate fetch.
      AND (NOT p_root_only OR dr.reply_to_id IS NULL)
      -- Cursor condition - composite (created_at, id) for stable pagination.
      -- When no cursor is provided (first page) the condition is skipped.
      AND (
        p_cursor_time IS NULL
        OR p_cursor_id IS NULL
        OR (
          p_ascending = true
          AND (
            dr.created_at > p_cursor_time
            OR (dr.created_at = p_cursor_time AND dr.id > p_cursor_id)
          )
        )
        OR (
          p_ascending = false
          AND (
            dr.created_at < p_cursor_time
            OR (dr.created_at = p_cursor_time AND dr.id < p_cursor_id)
          )
        )
      )
    ORDER BY
      -- UUID columns are natively orderable in PG; no ::text cast needed.
      -- The CASE WHEN pattern satisfies the planner for both directions
      -- within a single SQL function.
      CASE WHEN p_ascending     THEN dr.created_at END ASC,
      CASE WHEN p_ascending     THEN dr.id         END ASC,
      CASE WHEN NOT p_ascending THEN dr.created_at END DESC,
      CASE WHEN NOT p_ascending THEN dr.id         END DESC
    -- Fetch one extra row to cheaply determine whether a next page exists.
    LIMIT p_limit + 1
  ),
  bounded AS (
    SELECT *,
           ROW_NUMBER() OVER () AS rn,
           COUNT(*) OVER ()     AS total_fetched
    FROM page
  )
  SELECT
    b.id,
    b.discussion_id,
    b.created_by,
    b.created_at,
    b.modified_at,
    b.modified_by,
    b.reply_to_id,
    b.markdown,
    b.is_deleted,
    b.is_forum_reply,
    b.is_nsfw,
    b.is_offtopic,
    b.reactions,
    b.meta,
    -- has_more is true when we fetched p_limit+1 rows, meaning there is at
    -- least one more row beyond this page. Only expose it on the last visible
    -- row (rn = p_limit); the extra sentinel row is never returned.
    (b.total_fetched > p_limit) AS has_more
  FROM bounded b
  WHERE b.rn <= p_limit
$$;

GRANT EXECUTE ON FUNCTION public.get_discussion_replies_page(uuid, int, boolean, timestamptz, uuid, text, boolean)
  TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- get_discussion_reply_page_cursor
-- ---------------------------------------------------------------------------
-- Given a target reply id, returns the composite cursor for the START of the
-- page that contains that reply, plus the 0-based page index.
--
-- The front-end uses this to resolve ?comment=<id> deep links: call this RPC,
-- then call get_discussion_replies_page with the returned cursor to land
-- directly on the correct page.
--
-- Parameters:
--   p_discussion_id  uuid     - the discussion containing the reply
--   p_target_id      uuid     - the reply the user is navigating to
--   p_limit          int      - must match the page size used when fetching
--   p_ascending      boolean  - must match the sort order used when fetching
--   p_hash           text     - optional hash filter (must match fetch params)
--   p_root_only      boolean  - must match the root-only flag used when fetching
--
-- Returns:
--   page_index       int      - 0-based index of the page containing the target
--   cursor_time      timestamptz - created_at of the last reply on the
--                                  PRECEDING page (use as p_cursor_time)
--   cursor_id        uuid     - id of the last reply on the preceding page
--                               (use as p_cursor_id); NULL for page 0
--
-- When the target reply is on page 0, cursor_time and cursor_id are both NULL
-- (pass them directly to get_discussion_replies_page for the first page fetch).
--
-- Returns no rows when the target reply is not found (deleted, RLS-filtered,
-- or not in the root-only set when p_root_only = true).

CREATE OR REPLACE FUNCTION public.get_discussion_reply_page_cursor(
  p_discussion_id  uuid,
  p_target_id      uuid,
  p_limit          int         DEFAULT 25,
  p_ascending      boolean     DEFAULT true,
  p_hash           text        DEFAULT NULL,
  p_root_only      boolean     DEFAULT false
)
RETURNS TABLE (
  page_index   int,
  cursor_time  timestamptz,
  cursor_id    uuid
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH target AS (
    -- Fetch the target reply's sort key.
    -- If the reply doesn't exist (or is RLS-filtered, or is a child reply when
    -- p_root_only = true) the CTE returns no rows, causing the function to
    -- return no rows - the caller treats this as "not found".
    SELECT dr.created_at, dr.id
    FROM discussion_replies dr
    WHERE dr.id            = p_target_id
      AND dr.discussion_id = p_discussion_id
      AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
      AND (NOT p_root_only OR dr.reply_to_id IS NULL)
  ),
  page_info AS (
    -- Count how many replies sort before the target to determine its page.
    -- LEFT JOIN from target: if target is empty, no rows are produced here
    -- either, so the final query returns nothing (treated as "not found").
    -- COUNT(dr.id) counts only non-NULL joined rows (predecessors); 0 is
    -- correct when the target is the first reply in the ordered set.
    SELECT
      (COUNT(dr.id)::int / p_limit)::int AS pg
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
    pi.pg         AS page_index,
    lb.created_at AS cursor_time,
    lb.id         AS cursor_id
  FROM page_info pi
  -- Fetch the last row of the preceding page via OFFSET so we don't
  -- materialise all predecessor rows. When pg = 0 the WHERE clause inside
  -- the lateral rejects all rows and lb.* comes back NULL, which is the
  -- correct "no cursor needed" signal for page 0.
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
    -- OFFSET to the last row of the preceding page.
    -- pg=1 → OFFSET 0 (row index p_limit-1 in 0-based = last of page 0)
    OFFSET pi.pg * p_limit - 1
    LIMIT 1
  ) lb ON true
$$;

GRANT EXECUTE ON FUNCTION public.get_discussion_reply_page_cursor(uuid, uuid, int, boolean, text, boolean)
  TO authenticated, anon;
