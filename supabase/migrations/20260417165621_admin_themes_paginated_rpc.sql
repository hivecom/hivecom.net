-- Migration: admin_themes_paginated_rpc
-- Provides a single paginated, filterable, sortable RPC for the admin
-- themes table.

CREATE OR REPLACE FUNCTION public.get_admin_themes_paginated(
  p_search    text    DEFAULT '',
  p_sort_col  text    DEFAULT 'created_at',
  p_sort_dir  text    DEFAULT 'desc',
  p_limit     integer DEFAULT 10,
  p_offset    integer DEFAULT 0
)
RETURNS TABLE(
  id               uuid,
  name             text,
  description      text,
  created_at       timestamp with time zone,
  created_by       uuid,
  modified_at      timestamp with time zone,
  modified_by      uuid,
  is_official      boolean,
  is_unmaintained  boolean,
  forked_from      uuid,
  spacing          smallint,
  rounding         smallint,
  transitions      smallint,
  widening         smallint,
  dark_accent      text,
  light_accent     text,
  custom_css       text,
  total_count      bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_access boolean;
BEGIN
  has_access := public.has_permission('themes.read'::public.app_permission);

  IF NOT has_access THEN
    RAISE EXCEPTION 'Insufficient permissions to view admin themes overview';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id,
      t.name,
      t.description,
      t.created_at,
      t.created_by,
      t.modified_at,
      t.modified_by,
      t.is_official,
      t.is_unmaintained,
      t.forked_from,
      t.spacing,
      t.rounding,
      t.transitions,
      t.widening,
      t.dark_accent,
      t.light_accent,
      t.custom_css
    FROM public.themes AS t
    WHERE
      (
        p_search = ''
        OR t.name        ILIKE '%' || p_search || '%'
        OR t.description ILIKE '%' || p_search || '%'
      )
  )
  SELECT
    b.id,
    b.name,
    b.description,
    b.created_at,
    b.created_by,
    b.modified_at,
    b.modified_by,
    b.is_official,
    b.is_unmaintained,
    b.forked_from,
    b.spacing,
    b.rounding,
    b.transitions,
    b.widening,
    b.dark_accent,
    b.light_accent,
    b.custom_css,
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
        WHEN 'name' THEN b.name
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
        WHEN 'name' THEN b.name
        ELSE NULL::text
      END
    END DESC NULLS LAST,
    b.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_themes_paginated(text, text, text, integer, integer) TO authenticated;
