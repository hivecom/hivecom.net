-- Helper to determine whether an event still allows RSVP changes
CREATE OR REPLACE FUNCTION public.event_rsvp_window_open(target_event_id bigint)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
  SELECT
    EXISTS(
      SELECT
        1
      FROM
        public.events e
      WHERE
        e.id = target_event_id
        AND(e.date + COALESCE(e.duration_minutes, 0) * INTERVAL '1 minute') > NOW());
$$;

-- Refresh user-scoped RSVP policies with time-based guardrails
DROP POLICY IF EXISTS "Users can manage own RSVPs" ON public.events_rsvps;

CREATE POLICY "Users can insert own RSVPs before event ends" ON public.events_rsvps
  FOR INSERT TO authenticated
    WITH CHECK (user_id =(
      SELECT
        auth.uid())
        AND public.event_rsvp_window_open(event_id));

CREATE POLICY "Users can update own RSVPs before event ends" ON public.events_rsvps
  FOR UPDATE TO authenticated
    USING (user_id =(
      SELECT
        auth.uid())
        AND public.event_rsvp_window_open(event_id))
      WITH CHECK (user_id =(
        SELECT
          auth.uid())
          AND public.event_rsvp_window_open(event_id));

CREATE POLICY "Users can delete own RSVPs before event ends" ON public.events_rsvps
  FOR DELETE TO authenticated
    USING (user_id =(
      SELECT
        auth.uid())
        AND public.event_rsvp_window_open(event_id));

-- Administrators must respect the same event window when modifying RSVPs
DROP POLICY IF EXISTS "Allow authorized roles to INSERT events_rsvps" ON public.events_rsvps;

CREATE POLICY "Allow authorized roles to INSERT events_rsvps" ON public.events_rsvps AS permissive
  FOR INSERT TO authenticated
    WITH CHECK (public.has_permission('events.create'::public.app_permission)
    AND public.event_rsvp_window_open(event_id));

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE events_rsvps" ON public.events_rsvps;

CREATE POLICY "Allow authorized roles to UPDATE events_rsvps" ON public.events_rsvps AS permissive
  FOR UPDATE TO authenticated
    USING (public.has_permission('events.update'::public.app_permission)
      AND public.event_rsvp_window_open(event_id))
      WITH CHECK (public.has_permission('events.update'::public.app_permission)
      AND public.event_rsvp_window_open(event_id));

DROP POLICY IF EXISTS "Allow authorized roles to DELETE events_rsvps" ON public.events_rsvps;

CREATE POLICY "Allow authorized roles to DELETE events_rsvps" ON public.events_rsvps AS permissive
  FOR DELETE TO authenticated
    USING (public.has_permission('events.delete'::public.app_permission)
      AND public.event_rsvp_window_open(event_id));

