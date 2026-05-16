-- Fix discussion functions: qualify all unqualified table references with the
-- `public` schema. The previous migration (fix_function_search_path_mutable)
-- added SET search_path TO '' via ALTER FUNCTION on these five functions, which
-- broke any bare table name inside their SQL bodies.
--
-- Affected functions:
--   get_discussion_replies_page      - FROM discussion_replies (unqualified)
--   get_discussion_replies_tail      - FROM discussion_replies (unqualified)
--   get_discussion_reply_page_cursor - FROM discussion_replies (unqualified in CTEs)
--   get_forum_activity_feed          - FROM discussion_replies / discussions /
--                                      discussion_topics (all unqualified)
--   get_forum_activity_feed_today_count - same three tables unqualified

-- ─────────────────────────────────────────────────────────────────────────────
-- get_discussion_replies_page
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_discussion_replies_page(
  p_discussion_id uuid,
  p_limit         integer  DEFAULT 25,
  p_ascending     boolean  DEFAULT true,
  p_cursor_time   timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cursor_id     uuid     DEFAULT NULL::uuid,
  p_hash          text     DEFAULT NULL::text,
  p_root_only     boolean  DEFAULT false
)
RETURNS TABLE(
  id              uuid,
  discussion_id   uuid,
  created_by      uuid,
  created_at      timestamp with time zone,
  modified_at     timestamp with time zone,
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
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
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
    FROM public.discussion_replies dr
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
      CASE WHEN p_ascending     THEN dr.created_at END ASC,
      CASE WHEN p_ascending     THEN dr.id         END ASC,
      CASE WHEN NOT p_ascending THEN dr.created_at END DESC,
      CASE WHEN NOT p_ascending THEN dr.id         END DESC
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
    (b.total_fetched > p_limit) AS has_more
  FROM bounded b
  WHERE b.rn <= p_limit
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_discussion_replies_tail
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_discussion_replies_tail(
  p_discussion_id uuid,
  p_limit         integer DEFAULT 25,
  p_hash          text    DEFAULT NULL::text,
  p_root_only     boolean DEFAULT false
)
RETURNS TABLE(
  id              uuid,
  discussion_id   uuid,
  created_by      uuid,
  created_at      timestamp with time zone,
  modified_at     timestamp with time zone,
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
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
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
    FROM public.discussion_replies dr
    WHERE dr.discussion_id = p_discussion_id
      AND (p_hash IS NULL OR dr.meta->>'hash' = p_hash)
      AND (NOT p_root_only OR dr.reply_to_id IS NULL)
    ORDER BY dr.created_at DESC, dr.id DESC
    LIMIT p_limit
  ) t
  ORDER BY t.created_at ASC, t.id ASC
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_discussion_reply_page_cursor
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_discussion_reply_page_cursor(
  p_discussion_id uuid,
  p_target_id     uuid,
  p_limit         integer DEFAULT 25,
  p_ascending     boolean DEFAULT true,
  p_hash          text    DEFAULT NULL::text,
  p_root_only     boolean DEFAULT false
)
RETURNS TABLE(
  page_index        integer,
  predecessor_count integer,
  cursor_time       timestamp with time zone,
  cursor_id         uuid,
  prev_cursor_time  timestamp with time zone,
  prev_cursor_id    uuid
)
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  WITH target AS (
    SELECT dr.created_at, dr.id
    FROM public.discussion_replies dr
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
    LEFT JOIN public.discussion_replies dr ON
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
    SELECT dr.created_at, dr.id
    FROM public.discussion_replies dr
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
    SELECT dr.created_at, dr.id
    FROM public.discussion_replies dr
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
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_forum_activity_feed
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_forum_activity_feed(
  p_limit      integer DEFAULT 30,
  p_offset     integer DEFAULT 0,
  p_created_by uuid    DEFAULT NULL::uuid,
  p_exclude    uuid    DEFAULT NULL::uuid
)
RETURNS TABLE(
  id            uuid,
  item_type     text,
  discussion_id uuid,
  title         text,
  body          text,
  is_nsfw       boolean,
  is_offtopic   boolean,
  created_at    timestamp with time zone,
  created_by    uuid
)
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT
    dr.id,
    'reply'::text          AS item_type,
    dr.discussion_id,
    NULL::text             AS title,
    dr.markdown            AS body,
    dr.is_nsfw,
    dr.is_offtopic,
    dr.created_at,
    dr.created_by
  FROM public.discussion_replies dr
  WHERE dr.is_forum_reply = true
    AND dr.is_offtopic    = false
    AND dr.is_deleted     = false
    AND (p_created_by IS NULL OR dr.created_by = p_created_by)
    AND (p_exclude    IS NULL OR dr.created_by <> p_exclude)

  UNION ALL

  SELECT
    d.id,
    'discussion'::text     AS item_type,
    d.discussion_topic_id  AS discussion_id,
    d.title,
    d.description          AS body,
    d.is_nsfw,
    false                  AS is_offtopic,
    d.created_at,
    d.created_by
  FROM public.discussions d
  WHERE d.discussion_topic_id IS NOT NULL
    AND d.is_draft    = false
    AND d.is_archived = false
    AND (p_created_by IS NULL OR d.created_by = p_created_by)
    AND (p_exclude    IS NULL OR d.created_by <> p_exclude)

  UNION ALL

  SELECT
    dt.id,
    'topic'::text          AS item_type,
    NULL::uuid             AS discussion_id,
    dt.name                AS title,
    dt.description         AS body,
    false                  AS is_nsfw,
    false                  AS is_offtopic,
    dt.created_at,
    dt.created_by
  FROM public.discussion_topics dt
  WHERE dt.is_archived = false
    AND (p_created_by IS NULL OR dt.created_by = p_created_by)
    AND (p_exclude    IS NULL OR dt.created_by <> p_exclude)

  ORDER BY created_at DESC
  LIMIT  p_limit
  OFFSET p_offset
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_forum_activity_feed_today_count
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_forum_activity_feed_today_count(
  p_exclude uuid DEFAULT NULL::uuid
)
RETURNS integer
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT COUNT(*)::integer FROM (
    SELECT dr.id
    FROM public.discussion_replies dr
    WHERE dr.is_forum_reply = true
      AND dr.is_offtopic    = false
      AND dr.is_deleted     = false
      AND dr.created_at     > now() - interval '24 hours'
      AND (p_exclude IS NULL OR dr.created_by <> p_exclude)

    UNION ALL

    SELECT d.id
    FROM public.discussions d
    WHERE d.discussion_topic_id IS NOT NULL
      AND d.is_draft    = false
      AND d.is_archived = false
      AND d.created_at  > now() - interval '24 hours'
      AND (p_exclude IS NULL OR d.created_by <> p_exclude)

    UNION ALL

    SELECT dt.id
    FROM public.discussion_topics dt
    WHERE dt.is_archived = false
      AND dt.created_at  > now() - interval '24 hours'
      AND (p_exclude IS NULL OR dt.created_by <> p_exclude)
  ) activity
$function$;
