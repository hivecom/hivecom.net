CREATE OR REPLACE FUNCTION public.get_admin_steam_games_paginated(
  p_search   text    DEFAULT '',
  p_sort_col text    DEFAULT 'name',
  p_sort_dir text    DEFAULT 'asc',
  p_limit    integer DEFAULT 10,
  p_offset   integer DEFAULT 0
)
RETURNS TABLE (
  steam_id    bigint,
  name        text,
  updated_at  timestamptz,
  created_at  timestamptz,
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
      sg.steam_id,
      sg.name,
      sg.updated_at,
      sg.created_at
    FROM public.data_steam_games AS sg
    WHERE
      p_search = ''
      OR sg.name          ILIKE '%' || p_search || '%'
      OR sg.steam_id::text  LIKE '%' || p_search || '%'
  )
  SELECT
    b.steam_id,
    b.name,
    b.updated_at,
    b.created_at,
    COUNT(*) OVER () AS total_count
  FROM base AS b
  ORDER BY
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'created_at' THEN b.created_at
        WHEN 'updated_at' THEN b.updated_at
        ELSE NULL::timestamptz
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'name' THEN b.name
        ELSE NULL::text
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'created_at' THEN b.created_at
        WHEN 'updated_at' THEN b.updated_at
        ELSE NULL::timestamptz
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'name' THEN b.name
        ELSE NULL::text
      END
    END DESC NULLS LAST,
    b.name ASC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;
