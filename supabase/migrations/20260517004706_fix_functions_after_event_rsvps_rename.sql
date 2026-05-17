-- Update all functions that still reference public.events_rsvps after the table rename.

-- ─── get_effective_rsvp ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_effective_rsvp(
  p_user_id uuid,
  p_occurrence_id bigint
)
  RETURNS public.events_rsvp_status
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT COALESCE(
    (
      SELECT r.rsvp FROM public.event_rsvps r
      WHERE r.user_id = p_user_id
        AND r.event_id = p_occurrence_id
        AND r.scope = 'occurrence'
      LIMIT 1
    ),
    (
      SELECT r.rsvp FROM public.event_rsvps r
      JOIN public.events e ON e.id = p_occurrence_id
      WHERE r.user_id = p_user_id
        AND r.event_id = e.recurrence_parent_id
        AND r.scope = 'series'
        AND e.recurrence_parent_id IS NOT NULL
      LIMIT 1
    )
  );
$$;

-- ─── get_effective_rsvps_for_occurrence (single-arg overload) ───────────────────────────────────────

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
    FROM public.event_rsvps r, event_window w
    WHERE r.event_id = p_event_id
      AND r.scope = 'occurrence'
      AND r.occurrence_date >= w.occurrence_start
      AND r.occurrence_date <= w.occurrence_end
  ),
  series_rsvps AS (
    SELECT r.user_id, r.rsvp
    FROM public.event_rsvps r
    WHERE r.event_id = p_event_id
      AND r.scope = 'series'
  )
  SELECT DISTINCT ON (combined.user_id) combined.user_id, combined.rsvp
  FROM (
    SELECT user_id, rsvp, 1 AS priority FROM occurrence_rsvps
    UNION ALL
    SELECT user_id, rsvp, 2 AS priority FROM series_rsvps
  ) combined
  ORDER BY combined.user_id, combined.priority;
$$;

-- ─── get_effective_rsvps_for_occurrence (two-arg overload) ───────────────────────────────────────

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
    FROM public.event_rsvps r, event_window w
    WHERE r.event_id = p_event_id
      AND r.scope = 'occurrence'
      AND r.occurrence_date >= w.occurrence_start
      AND r.occurrence_date <= w.occurrence_end
  ),
  series_rsvps AS (
    SELECT r.user_id, r.rsvp, r.scope
    FROM public.event_rsvps r
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

-- ─── trigger_notify_and_reset_event_rsvps_on_date_change ─────────────────────

CREATE OR REPLACE FUNCTION public.trigger_notify_and_reset_event_rsvps_on_date_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.date IS DISTINCT FROM NEW.date THEN
    WITH affected_users AS (
      UPDATE public.event_rsvps
      SET rsvp = 'tentative'
      WHERE event_id = NEW.id
        AND rsvp = 'yes'
      RETURNING user_id
    )
    INSERT INTO public.user_notifications (user_id, title, body, href, source, source_id)
    SELECT
      user_id,
      NEW.title || ' was rescheduled',
      'Your RSVP was changed to tentative.',
      '/events/' || NEW.id,
      'event_rescheduled',
      NEW.id::text
    FROM affected_users
    ON CONFLICT (user_id, source, source_id) WHERE source IS NOT NULL AND source_id IS NOT NULL
    DO UPDATE SET
      title       = EXCLUDED.title,
      body        = EXCLUDED.body,
      href        = EXCLUDED.href,
      is_read     = false,
      modified_at = now();
  END IF;
  RETURN NEW;
END;
$$;
