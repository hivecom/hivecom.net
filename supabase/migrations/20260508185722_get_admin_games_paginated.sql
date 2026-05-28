CREATE OR REPLACE FUNCTION public.get_admin_games_paginated(
  p_search   text    DEFAULT '',
  p_sort_col text    DEFAULT 'name',
  p_sort_dir text    DEFAULT 'asc',
  p_limit    integer DEFAULT 10,
  p_offset   integer DEFAULT 0
)
RETURNS TABLE (
  id          bigint,
  name        text,
  shorthand   text,
  steam_id    bigint,
  website     text,
  created_at  timestamptz,
  created_by  uuid,
  modified_at timestamptz,
  modified_by uuid,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      g.id,
      g.name,
      g.shorthand,
      g.steam_id,
      g.website,
      g.created_at,
      g.created_by,
      g.modified_at,
      g.modified_by
    FROM public.games AS g
    WHERE
      p_search = ''
      OR g.name      ILIKE '%' || p_search || '%'
      OR g.shorthand ILIKE '%' || p_search || '%'
  )
  SELECT
    b.id,
    b.name,
    b.shorthand,
    b.steam_id,
    b.website,
    b.created_at,
    b.created_by,
    b.modified_at,
    b.modified_by,
    COUNT(*) OVER () AS total_count
  FROM base AS b
  ORDER BY
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'created_at'  THEN b.created_at
        WHEN 'modified_at' THEN b.modified_at
        ELSE NULL::timestamptz
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'name'      THEN b.name
        WHEN 'shorthand' THEN b.shorthand
        ELSE NULL::text
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'created_at'  THEN b.created_at
        WHEN 'modified_at' THEN b.modified_at
        ELSE NULL::timestamptz
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'name'      THEN b.name
        WHEN 'shorthand' THEN b.shorthand
        ELSE NULL::text
      END
    END DESC NULLS LAST,
    b.name ASC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;
