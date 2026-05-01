-- 1. Add the scope enum type
CREATE TYPE public.events_rsvp_scope AS ENUM ('occurrence', 'series');

-- 2. Add scope column, defaulting existing rows to 'occurrence'
ALTER TABLE public.events_rsvps
  ADD COLUMN scope public.events_rsvp_scope NOT NULL DEFAULT 'occurrence';

-- 3. Drop old unique constraint (user_id, event_id) and replace with
--    (user_id, event_id, scope) so a user can have both a series RSVP
--    on the parent AND a per-occurrence override on a child.
ALTER TABLE public.events_rsvps
  DROP CONSTRAINT events_rsvps_user_event_key;

ALTER TABLE public.events_rsvps
  ADD CONSTRAINT events_rsvps_user_event_scope_key UNIQUE (user_id, event_id, scope);

-- 4. Helper to validate scope='series' is only used on parent events
CREATE OR REPLACE FUNCTION public.events_rsvps_scope_valid(
  p_event_id bigint,
  p_scope public.events_rsvp_scope
)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_scope = 'occurrence' THEN true
    WHEN p_scope = 'series' THEN EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event_id
        AND e.recurrence_rule IS NOT NULL
        AND e.recurrence_parent_id IS NULL
    )
    ELSE false
  END;
$$;

ALTER TABLE public.events_rsvps
  ADD CONSTRAINT events_rsvps_series_scope_check
    CHECK (public.events_rsvps_scope_valid(event_id, scope));

-- 5. Update event_rsvp_window_open so that series-parent rows (which have a
--    recurrence_rule and no parent themselves) are always considered open.
CREATE OR REPLACE FUNCTION public.event_rsvp_window_open(target_event_id bigint)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = target_event_id
      AND (
        -- Series parent: window is always open while the series exists
        (e.recurrence_rule IS NOT NULL AND e.recurrence_parent_id IS NULL)
        OR
        -- One-off or child occurrence: window closes when event ends
        (e.date + COALESCE(e.duration_minutes, 0) * INTERVAL '1 minute') > NOW()
      )
  );
$$;

-- 6. Helper function to resolve the effective RSVP status for a user
--    against a specific occurrence, applying the series fallback.
--    Returns NULL when no RSVP exists at either level.
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
    -- 1. Occurrence-level override (highest priority)
    (
      SELECT r.rsvp FROM public.events_rsvps r
      WHERE r.user_id = p_user_id
        AND r.event_id = p_occurrence_id
        AND r.scope = 'occurrence'
      LIMIT 1
    ),
    -- 2. Series-level fallback (only when occurrence is a child of a series)
    (
      SELECT r.rsvp FROM public.events_rsvps r
      JOIN public.events e ON e.id = p_occurrence_id
      WHERE r.user_id = p_user_id
        AND r.event_id = e.recurrence_parent_id
        AND r.scope = 'series'
        AND e.recurrence_parent_id IS NOT NULL
      LIMIT 1
    )
  );
$$;

-- 7. Indexes to make scope-based lookups fast
CREATE INDEX idx_events_rsvps_scope ON public.events_rsvps USING btree (scope);
CREATE INDEX idx_events_rsvps_event_scope ON public.events_rsvps USING btree (event_id, scope);
