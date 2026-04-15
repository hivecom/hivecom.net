-- Migration: admin_referendums_paginated_visibility_filter
-- Adds a p_visibility filter parameter ('public' | 'private') to the
-- get_admin_referendums_paginated RPC.

DROP FUNCTION IF EXISTS public.get_admin_referendums_paginated(text, text[], text[], text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_admin_referendums_paginated(
  p_search      text     DEFAULT '',
  p_status      text[]   DEFAULT '{}',
  p_type        text[]   DEFAULT '{}',
  p_visibility  text[]   DEFAULT '{}',
  p_sort_col    text     DEFAULT 'date_start',
  p_sort_dir    text     DEFAULT 'desc',
  p_limit       integer  DEFAULT 10,
  p_offset      integer  DEFAULT 0
)
RETURNS TABLE(
  id              bigint,
  title           text,
  description     text,
  date_start      timestamp with time zone,
  date_end        timestamp with time zone,
  choices         text[],
  multiple_choice boolean,
  is_public       boolean,
  created_at      timestamp with time zone,
  created_by      uuid,
  modified_at     timestamp with time zone,
  modified_by     uuid,
  vote_count      bigint,
  total_count     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_access boolean;
BEGIN
  has_access := public.has_permission('referendums.read'::public.app_permission);

  IF NOT has_access THEN
    RAISE EXCEPTION 'Insufficient permissions to view admin referendums overview';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      r.id,
      r.title,
      r.description,
      r.date_start,
      r.date_end,
      r.choices,
      r.multiple_choice,
      r.is_public,
      r.created_at,
      r.created_by,
      r.modified_at,
      r.modified_by,
      (
        SELECT COUNT(*)
        FROM public.referendum_votes AS rv
        WHERE rv.referendum_id = r.id
      )::bigint                                                        AS vote_count
    FROM public.referendums AS r
    WHERE
      -- Search filter: title, description
      (
        p_search = ''
        OR r.title       ILIKE '%' || p_search || '%'
        OR r.description ILIKE '%' || p_search || '%'
      )
      -- Status filter (OR across selected statuses; empty = all)
      AND (
        array_length(p_status, 1) IS NULL
        OR (
          ('active'    = ANY(p_status) AND r.date_start <= now() AND r.date_end >= now())
          OR ('upcoming'  = ANY(p_status) AND r.date_start > now())
          OR ('concluded' = ANY(p_status) AND r.date_end   < now())
        )
      )
      -- Type filter (OR across selected types; empty = all)
      AND (
        array_length(p_type, 1) IS NULL
        OR (
          ('single'   = ANY(p_type) AND r.multiple_choice = false)
          OR ('multiple' = ANY(p_type) AND r.multiple_choice = true)
        )
      )
      -- Visibility filter (OR across selected visibilities; empty = all)
      AND (
        array_length(p_visibility, 1) IS NULL
        OR (
          ('public'  = ANY(p_visibility) AND r.is_public = true)
          OR ('private' = ANY(p_visibility) AND r.is_public = false)
        )
      )
  )
  SELECT
    b.id,
    b.title,
    b.description,
    b.date_start,
    b.date_end,
    b.choices,
    b.multiple_choice,
    b.is_public,
    b.created_at,
    b.created_by,
    b.modified_at,
    b.modified_by,
    b.vote_count,
    COUNT(*) OVER ()                                                    AS total_count
  FROM base AS b
  ORDER BY
    -- ASC branch (timestamptz columns)
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'date_start' THEN b.date_start
        WHEN 'date_end'   THEN b.date_end
        WHEN 'created_at' THEN b.created_at
        ELSE NULL::timestamptz
      END
    END ASC NULLS LAST,
    -- ASC branch (text columns)
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'title' THEN b.title
        ELSE NULL::text
      END
    END ASC NULLS LAST,
    -- ASC branch (bigint columns)
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'votes' THEN b.vote_count
        ELSE NULL::bigint
      END
    END ASC NULLS LAST,
    -- DESC branch (timestamptz columns)
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'date_start' THEN b.date_start
        WHEN 'date_end'   THEN b.date_end
        WHEN 'created_at' THEN b.created_at
        ELSE NULL::timestamptz
      END
    END DESC NULLS LAST,
    -- DESC branch (text columns)
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'title' THEN b.title
        ELSE NULL::text
      END
    END DESC NULLS LAST,
    -- DESC branch (bigint columns)
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'votes' THEN b.vote_count
        ELSE NULL::bigint
      END
    END DESC NULLS LAST,
    -- Stable tiebreaker
    b.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_referendums_paginated(text, text[], text[], text[], text, text, integer, integer) TO authenticated;
