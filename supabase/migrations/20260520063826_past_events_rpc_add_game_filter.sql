-- Add p_game_id filter param to past events RPCs.
-- Allows filtering past events by a specific game ID (bigint array column).

CREATE OR REPLACE FUNCTION public.get_past_events_count(
  p_search         text    DEFAULT NULL,
  p_is_official    boolean DEFAULT NULL,
  p_hide_recurring boolean DEFAULT FALSE,
  p_game_id        bigint  DEFAULT NULL
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
    AND (p_is_official IS NULL OR is_official = p_is_official)
    AND (NOT p_hide_recurring OR recurrence_rule IS NULL)
    AND (p_game_id IS NULL OR p_game_id = ANY(games));
$$;

CREATE OR REPLACE FUNCTION public.get_past_events_paginated(
  p_limit          integer DEFAULT 10,
  p_offset         integer DEFAULT 0,
  p_search         text    DEFAULT NULL,
  p_is_official    boolean DEFAULT NULL,
  p_hide_recurring boolean DEFAULT FALSE,
  p_game_id        bigint  DEFAULT NULL
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
    AND (NOT p_hide_recurring OR recurrence_rule IS NULL)
    AND (p_game_id IS NULL OR p_game_id = ANY(games))
  ORDER BY date DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;
