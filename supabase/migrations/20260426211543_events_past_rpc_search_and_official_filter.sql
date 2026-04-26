-- Add search and is_official filter params to past events RPCs.
-- Allows the public events listing to filter past events by search query and official status.

CREATE OR REPLACE FUNCTION public.get_past_events_count(
  p_search text DEFAULT NULL,
  p_is_official boolean DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::bigint
  FROM public.events
  WHERE (date + (COALESCE(duration_minutes, 0) || ' minutes')::interval) < NOW()
    AND (
      p_search IS NULL
      OR title ILIKE '%' || p_search || '%'
      OR description ILIKE '%' || p_search || '%'
    )
    AND (p_is_official IS NULL OR is_official = p_is_official);
$$;

CREATE OR REPLACE FUNCTION public.get_past_events_paginated(
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_is_official boolean DEFAULT NULL
)
RETURNS SETOF events
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.events
  WHERE (date + (COALESCE(duration_minutes, 0) || ' minutes')::interval) < NOW()
    AND (
      p_search IS NULL
      OR title ILIKE '%' || p_search || '%'
      OR description ILIKE '%' || p_search || '%'
    )
    AND (p_is_official IS NULL OR is_official = p_is_official)
  ORDER BY date DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;
