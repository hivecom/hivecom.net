-- Migration: admin_events_paginated_rpc
-- Provides a single paginated, filterable, sortable RPC for the admin
-- events table, replacing multiple client-side queries.

CREATE OR REPLACE FUNCTION public.get_admin_events_paginated(
  p_search    text    DEFAULT '',
  p_sort_col  text    DEFAULT 'date',
  p_sort_dir  text    DEFAULT 'desc',
  p_limit     integer DEFAULT 10,
  p_offset    integer DEFAULT 0
)
RETURNS TABLE(
  id                    bigint,
  title                 text,
  description           text,
  note                  text,
  markdown              text,
  date                  timestamp with time zone,
  location              text,
  link                  text,
  duration_minutes      bigint,
  games                 bigint[],
  google_event_id       text,
  google_last_synced_at timestamp with time zone,
  discord_event_id      text,
  discord_last_synced_at timestamp with time zone,
  created_at            timestamp with time zone,
  created_by            uuid,
  modified_at           timestamp with time zone,
  modified_by           uuid,
  total_count           bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      e.modified_by
    FROM public.events AS e
    WHERE
      -- Search filter: title, description, location
      (
        p_search = ''
        OR e.title       ILIKE '%' || p_search || '%'
        OR e.description ILIKE '%' || p_search || '%'
        OR e.location    ILIKE '%' || p_search || '%'
      )
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
    COUNT(*) OVER ()                                                   AS total_count
  FROM base AS b
  ORDER BY
    -- ASC branch (timestamptz columns)
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'date'       THEN b.date
        WHEN 'created_at' THEN b.created_at
        ELSE NULL::timestamptz
      END
    END ASC NULLS LAST,
    -- ASC branch (text columns)
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'title'    THEN b.title
        WHEN 'location' THEN b.location
        ELSE NULL::text
      END
    END ASC NULLS LAST,
    -- DESC branch (timestamptz columns)
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'date'       THEN b.date
        WHEN 'created_at' THEN b.created_at
        ELSE NULL::timestamptz
      END
    END DESC NULLS LAST,
    -- DESC branch (text columns)
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'title'    THEN b.title
        WHEN 'location' THEN b.location
        ELSE NULL::text
      END
    END DESC NULLS LAST,
    -- Stable tiebreaker
    b.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_events_paginated(text, text, text, integer, integer) TO authenticated;
