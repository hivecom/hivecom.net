DROP FUNCTION IF EXISTS public.get_admin_events_paginated(text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_admin_events_paginated(text, text, text, integer, integer, boolean);

CREATE FUNCTION public.get_admin_events_paginated(
  p_search      text    DEFAULT '',
  p_sort_col    text    DEFAULT 'date',
  p_sort_dir    text    DEFAULT 'desc',
  p_limit       integer DEFAULT 20,
  p_offset      integer DEFAULT 0,
  p_is_official boolean DEFAULT NULL
)
RETURNS TABLE (
  id                     bigint,
  title                  text,
  description            text,
  note                   text,
  markdown               text,
  date                   timestamptz,
  location               text,
  link                   text,
  duration_minutes       bigint,
  games                  bigint[],
  google_event_id        text,
  google_last_synced_at  timestamptz,
  discord_event_id       text,
  discord_last_synced_at timestamptz,
  created_at             timestamptz,
  created_by             uuid,
  modified_at            timestamptz,
  modified_by            uuid,
  is_official            boolean,
  recurrence_rule        text,
  recurrence_parent_id   bigint,
  recurrence_exception   boolean,
  total_count            bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_access boolean;
BEGIN
  has_access := public.has_permission('events.read'::public.app_permission);

  IF NOT has_access THEN
    RAISE EXCEPTION 'Insufficient permissions to view admin events overview';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      e.id,
      e.title,
      e.description,
      e.note,
      e.markdown,
      e.date,
      e.location,
      e.link,
      e.duration_minutes,
      e.games,
      e.google_event_id,
      e.google_last_synced_at,
      e.discord_event_id,
      e.discord_last_synced_at,
      e.created_at,
      e.created_by,
      e.modified_at,
      e.modified_by,
      e.is_official,
      e.recurrence_rule,
      e.recurrence_parent_id,
      e.recurrence_exception
    FROM public.events AS e
    WHERE
      (
        p_search = ''
        OR e.title       ILIKE '%' || p_search || '%'
        OR e.description ILIKE '%' || p_search || '%'
        OR e.location    ILIKE '%' || p_search || '%'
      )
      AND (p_is_official IS NULL OR e.is_official = p_is_official)
  )
  SELECT
    b.id,
    b.title,
    b.description,
    b.note,
    b.markdown,
    b.date,
    b.location,
    b.link,
    b.duration_minutes,
    b.games,
    b.google_event_id,
    b.google_last_synced_at,
    b.discord_event_id,
    b.discord_last_synced_at,
    b.created_at,
    b.created_by,
    b.modified_at,
    b.modified_by,
    b.is_official,
    b.recurrence_rule,
    b.recurrence_parent_id,
    b.recurrence_exception,
    COUNT(*) OVER () AS total_count
  FROM base AS b
  ORDER BY
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'date'       THEN b.date
        WHEN 'created_at' THEN b.created_at
        ELSE NULL::timestamptz
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'title'            THEN b.title
        WHEN 'location'         THEN b.location
        WHEN 'recurrence_rule'  THEN b.recurrence_rule
        ELSE NULL::text
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'is_official' THEN b.is_official::int
        ELSE NULL::int
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'date'       THEN b.date
        WHEN 'created_at' THEN b.created_at
        ELSE NULL::timestamptz
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'title'            THEN b.title
        WHEN 'location'         THEN b.location
        WHEN 'recurrence_rule'  THEN b.recurrence_rule
        ELSE NULL::text
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'is_official' THEN b.is_official::int
        ELSE NULL::int
      END
    END DESC NULLS LAST,
    b.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_events_paginated(text, text, text, integer, integer, boolean) TO authenticated;
