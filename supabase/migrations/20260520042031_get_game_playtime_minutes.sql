-- Returns the estimated minutes played for a specific community game ID
-- over the given time window, computed from raw 5-minute metric snapshots.
--
-- Each raw snapshot where the game had N concurrent players contributes
-- N * collection_interval_minutes to the total. The collection interval is
-- passed as a parameter so the caller can match whatever cadence is in use
-- (default 5 minutes).
--
-- This is intentionally a simple sum over raw rows rather than bucketed data,
-- so no averaging or MAX distortion is introduced.
CREATE OR REPLACE FUNCTION public.get_game_playtime_minutes(
  p_game_id        integer,
  p_since          timestamp with time zone,
  p_until          timestamp with time zone,
  p_interval_mins  numeric DEFAULT 5
)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(
    SUM(
      (m.data -> 'users' -> 'byGame' ->> p_game_id::text)::numeric
      * p_interval_mins
    ),
    0
  )
  FROM public.metrics m
  WHERE m.captured_at >= p_since
    AND m.captured_at <  p_until
    AND (m.data -> 'users' -> 'byGame') ? p_game_id::text
    AND (m.data -> 'users' -> 'byGame' ->> p_game_id::text)::numeric > 0;
$$;
