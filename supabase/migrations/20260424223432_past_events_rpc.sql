-- Returns the count of fully-ended events (end time < now).
-- An event's end time is date + duration_minutes; if duration_minutes is NULL
-- the event ends at its start time.
CREATE OR REPLACE FUNCTION public.get_past_events_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM public.events
  WHERE (date + (COALESCE(duration_minutes, 0) || ' minutes')::interval) < NOW();
$$;

GRANT EXECUTE ON FUNCTION public.get_past_events_count() TO anon, authenticated;

-- Returns a page of fully-ended events ordered by date descending.
CREATE OR REPLACE FUNCTION public.get_past_events_paginated(
  p_limit  integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.events
  WHERE (date + (COALESCE(duration_minutes, 0) || ' minutes')::interval) < NOW()
  ORDER BY date DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_past_events_paginated(integer, integer) TO anon, authenticated;
