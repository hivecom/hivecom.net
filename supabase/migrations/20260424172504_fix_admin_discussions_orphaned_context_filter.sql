-- Fix: add 'other' (orphaned) context branch to get_admin_discussions_paginated.
-- Previously passing p_context = ['other'] returned 0 rows because no branch
-- matched the value, even though the array was non-empty (bypassing the
-- array_length IS NULL short-circuit). Orphaned discussions have all context
-- FK columns set to NULL.

CREATE OR REPLACE FUNCTION public.get_admin_discussions_paginated(
  p_search     text    DEFAULT ''::text,
  p_status     text[]  DEFAULT '{}'::text[],
  p_context    text[]  DEFAULT '{}'::text[],
  p_author_id  uuid    DEFAULT NULL::uuid,
  p_sort_col   text    DEFAULT 'last_active'::text,
  p_sort_dir   text    DEFAULT 'desc'::text,
  p_limit      integer DEFAULT 10,
  p_offset     integer DEFAULT 0
)
RETURNS TABLE(
  id                    uuid,
  title                 text,
  description           text,
  slug                  text,
  created_at            timestamptz,
  created_by            uuid,
  modified_at           timestamptz,
  modified_by           uuid,
  is_locked             boolean,
  is_sticky             boolean,
  is_archived           boolean,
  is_draft              boolean,
  is_nsfw               boolean,
  reply_count           bigint,
  view_count            bigint,
  accepted_reply_id     uuid,
  discussion_topic_id   uuid,
  profile_id            uuid,
  project_id            bigint,
  event_id              bigint,
  gameserver_id         bigint,
  referendum_id         bigint,
  theme_id              uuid,
  created_by_username   text,
  profile_username      text,
  project_title         text,
  event_title           text,
  gameserver_name       text,
  referendum_title      text,
  discussion_topic_name text,
  theme_name            text,
  last_reply_at         timestamptz,
  last_reply_by         uuid,
  total_count           bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_access boolean;
BEGIN
  has_access := public.has_permission('discussions.read'::public.app_permission);

  IF NOT has_access THEN
    RAISE EXCEPTION 'Insufficient permissions to view admin discussions overview';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      d.id,
      d.title,
      d.description,
      d.slug,
      d.created_at,
      d.created_by,
      d.modified_at,
      d.modified_by,
      d.is_locked,
      d.is_sticky,
      d.is_archived,
      d.is_draft,
      d.is_nsfw,
      d.reply_count,
      d.view_count,
      d.accepted_reply_id,
      d.discussion_topic_id,
      d.profile_id,
      d.project_id,
      d.event_id,
      d.gameserver_id,
      d.referendum_id,
      d.theme_id,
      cbp.username::text                AS created_by_username,
      pfp.username::text                AS profile_username,
      projects.title::text              AS project_title,
      events.title::text                AS event_title,
      gameservers.name::text            AS gameserver_name,
      referendums.title::text           AS referendum_title,
      discussion_topics.name::text      AS discussion_topic_name,
      themes.name::text                 AS theme_name,
      last_reply.created_at             AS last_reply_at,
      last_reply.created_by             AS last_reply_by
    FROM public.discussions AS d
    LEFT JOIN public.profiles AS cbp        ON cbp.id = d.created_by
    LEFT JOIN public.profiles AS pfp        ON pfp.id = d.profile_id
    LEFT JOIN public.projects               ON projects.id = d.project_id
    LEFT JOIN public.events                 ON events.id = d.event_id
    LEFT JOIN public.gameservers            ON gameservers.id = d.gameserver_id
    LEFT JOIN public.referendums            ON referendums.id = d.referendum_id
    LEFT JOIN public.discussion_topics      ON discussion_topics.id = d.discussion_topic_id
    LEFT JOIN public.themes                 ON themes.id = d.theme_id
    LEFT JOIN LATERAL (
      SELECT dr.created_at, dr.created_by
      FROM public.discussion_replies AS dr
      WHERE dr.discussion_id = d.id
        AND dr.is_deleted = false
      ORDER BY dr.created_at DESC
      LIMIT 1
    ) AS last_reply ON true
    WHERE
      -- Search filter
      (
        p_search = ''
        OR d.title       ILIKE '%' || p_search || '%'
        OR d.description ILIKE '%' || p_search || '%'
        OR d.slug        ILIKE '%' || p_search || '%'
      )
      -- Status filter (OR across selected statuses; empty = all)
      AND (
        array_length(p_status, 1) IS NULL
        OR (
             ('open'     = ANY(p_status) AND NOT d.is_locked AND NOT d.is_archived AND NOT d.is_draft)
          OR ('locked'   = ANY(p_status) AND d.is_locked   = true)
          OR ('pinned'   = ANY(p_status) AND d.is_sticky   = true)
          OR ('archived' = ANY(p_status) AND d.is_archived = true)
          OR ('draft'    = ANY(p_status) AND d.is_draft    = true)
        )
      )
      -- Context filter (OR across selected contexts; empty = all)
      AND (
        array_length(p_context, 1) IS NULL
        OR (
          -- Forum: has a topic but no other context FK
          (
            'general' = ANY(p_context)
            AND d.discussion_topic_id IS NOT NULL
            AND d.profile_id    IS NULL
            AND d.project_id    IS NULL
            AND d.event_id      IS NULL
            AND d.gameserver_id IS NULL
            AND d.referendum_id IS NULL
          )
          OR ('profiles'    = ANY(p_context) AND d.profile_id    IS NOT NULL)
          OR ('projects'    = ANY(p_context) AND d.project_id    IS NOT NULL)
          OR ('events'      = ANY(p_context) AND d.event_id      IS NOT NULL)
          OR ('gameservers' = ANY(p_context) AND d.gameserver_id IS NOT NULL)
          OR ('referendums' = ANY(p_context) AND d.referendum_id IS NOT NULL)
          OR ('themes'      = ANY(p_context) AND d.theme_id      IS NOT NULL)
          -- Orphaned: all context FK columns are NULL
          OR (
            'other' = ANY(p_context)
            AND d.discussion_topic_id IS NULL
            AND d.profile_id          IS NULL
            AND d.project_id          IS NULL
            AND d.event_id            IS NULL
            AND d.gameserver_id       IS NULL
            AND d.referendum_id       IS NULL
            AND d.theme_id            IS NULL
          )
        )
      )
      -- Author filter (NULL = all authors)
      AND (
        p_author_id IS NULL
        OR d.created_by = p_author_id
      )
  )
  SELECT
    b.id,
    b.title,
    b.description,
    b.slug,
    b.created_at,
    b.created_by,
    b.modified_at,
    b.modified_by,
    b.is_locked,
    b.is_sticky,
    b.is_archived,
    b.is_draft,
    b.is_nsfw,
    b.reply_count,
    b.view_count,
    b.accepted_reply_id,
    b.discussion_topic_id,
    b.profile_id,
    b.project_id,
    b.event_id,
    b.gameserver_id,
    b.referendum_id,
    b.theme_id,
    b.created_by_username,
    b.profile_username,
    b.project_title,
    b.event_title,
    b.gameserver_name,
    b.referendum_title,
    b.discussion_topic_name,
    b.theme_name,
    b.last_reply_at,
    b.last_reply_by,
    COUNT(*) OVER () AS total_count
  FROM base AS b
  ORDER BY
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'last_active' THEN GREATEST(b.modified_at, b.last_reply_at, b.created_at)
        WHEN 'created_at'  THEN b.created_at
        ELSE NULL::timestamptz
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'title' THEN b.title
        ELSE NULL::text
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'replies' THEN b.reply_count
        WHEN 'views'   THEN b.view_count
        ELSE NULL::bigint
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'last_active' THEN GREATEST(b.modified_at, b.last_reply_at, b.created_at)
        WHEN 'created_at'  THEN b.created_at
        ELSE NULL::timestamptz
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'title' THEN b.title
        ELSE NULL::text
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'replies' THEN b.reply_count
        WHEN 'views'   THEN b.view_count
        ELSE NULL::bigint
      END
    END DESC NULLS LAST,
    b.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$function$;
