-- Returns the effective RSVP for every user for a given event occurrence.
--
-- Resolution rules:
--   1. occurrence-scoped RSVP where occurrence_date falls within the occurrence
--      window [event.date, event.date + duration_minutes] takes priority.
--   2. series-scoped RSVP on the same event is the fallback.
--   3. If a user has both, the occurrence-scoped row wins.
--   4. Stale occurrence-scoped RSVPs (occurrence_date outside the window) are ignored.

CREATE OR REPLACE FUNCTION public.get_effective_rsvps_for_occurrence(p_event_id bigint)
  RETURNS TABLE (user_id uuid, rsvp public.events_rsvp_status)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH event_window AS (
    SELECT
      e.date AS occurrence_start,
      e.date + COALESCE(e.duration_minutes, 0) * INTERVAL '1 minute' AS occurrence_end
    FROM public.events e
    WHERE e.id = p_event_id
  ),
  occurrence_rsvps AS (
    SELECT r.user_id, r.rsvp
    FROM public.events_rsvps r, event_window w
    WHERE r.event_id = p_event_id
      AND r.scope = 'occurrence'
      AND r.occurrence_date >= w.occurrence_start
      AND r.occurrence_date <= w.occurrence_end
  ),
  series_rsvps AS (
    SELECT r.user_id, r.rsvp
    FROM public.events_rsvps r
    WHERE r.event_id = p_event_id
      AND r.scope = 'series'
  )
  -- Occurrence-scoped wins over series-scoped for the same user
  SELECT DISTINCT ON (combined.user_id) combined.user_id, combined.rsvp
  FROM (
    SELECT user_id, rsvp, 1 AS priority FROM occurrence_rsvps
    UNION ALL
    SELECT user_id, rsvp, 2 AS priority FROM series_rsvps
  ) combined
  ORDER BY combined.user_id, combined.priority;
$$;

COMMENT ON FUNCTION public.get_effective_rsvps_for_occurrence(bigint) IS
  'Returns one effective RSVP row per user for the given event occurrence.
   Occurrence-scoped RSVPs within [event.date, event.date + duration_minutes] take priority over
   series-scoped RSVPs. Stale occurrence-scoped RSVPs outside the window are ignored.';
