-- Updates get_effective_rsvps_for_occurrence with two additions:
--
-- 1. p_occurrence_date (optional) - anchors the occurrence window to the given
--    timestamp instead of e.date. Fixes recurring series where e.date is the
--    series origin and never advances, so occurrence RSVPs stored against the
--    next occurrence date were falling outside the window and being ignored.
--
-- 2. Returns scope column - lets callers distinguish series-level RSVPs from
--    occurrence-specific overrides (used in the RSVP modal to badge each user).
--
-- Fully backward-compatible: callers that omit p_occurrence_date keep existing behavior.

CREATE OR REPLACE FUNCTION public.get_effective_rsvps_for_occurrence(
  p_event_id        bigint,
  p_occurrence_date timestamptz DEFAULT NULL
)
  RETURNS TABLE (user_id uuid, rsvp public.events_rsvp_status, scope public.events_rsvp_scope)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH event_window AS (
    SELECT
      COALESCE(p_occurrence_date, e.date) AS occurrence_start,
      COALESCE(p_occurrence_date, e.date) + COALESCE(e.duration_minutes, 0) * INTERVAL '1 minute' AS occurrence_end
    FROM public.events e
    WHERE e.id = p_event_id
  ),
  occurrence_rsvps AS (
    SELECT r.user_id, r.rsvp, r.scope
    FROM public.events_rsvps r, event_window w
    WHERE r.event_id = p_event_id
      AND r.scope = 'occurrence'
      AND r.occurrence_date >= w.occurrence_start
      AND r.occurrence_date <= w.occurrence_end
  ),
  series_rsvps AS (
    SELECT r.user_id, r.rsvp, r.scope
    FROM public.events_rsvps r
    WHERE r.event_id = p_event_id
      AND r.scope = 'series'
  )
  SELECT DISTINCT ON (combined.user_id) combined.user_id, combined.rsvp, combined.scope
  FROM (
    SELECT user_id, rsvp, scope, 1 AS priority FROM occurrence_rsvps
    UNION ALL
    SELECT user_id, rsvp, scope, 2 AS priority FROM series_rsvps
  ) combined
  ORDER BY combined.user_id, combined.priority;
$$;

COMMENT ON FUNCTION public.get_effective_rsvps_for_occurrence(bigint, timestamptz) IS
  'Returns one effective RSVP row per user for the given event occurrence, including scope.
   Pass p_occurrence_date to anchor the window to a specific occurrence (e.g. next occurrence
   from rrule expansion). Falls back to event.date when NULL.
   Occurrence-scoped RSVPs within [occurrence_start, occurrence_start + duration_minutes]
   take priority over series-scoped RSVPs. Returns scope so callers can distinguish them.';
