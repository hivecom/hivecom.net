-- Restore RLS policies silently dropped by DROP TYPE ... CASCADE in
-- 20260515164827_consolidate_permissions_step2_migrate_and_cleanup.sql
-- that were not caught by previous restore migrations.
--
-- Affected policies:
--   1. "Allow authorized roles to INSERT events_rsvps" ON public.event_rsvps
--      (20251124103000_events_rsvp_time_guards.sql)
--   2. "Allow authorized roles to UPDATE events_rsvps" ON public.event_rsvps
--      (20251124103000_events_rsvp_time_guards.sql)
--   3. "Allow authorized roles to DELETE events_rsvps" ON public.event_rsvps
--      (20251124103000_events_rsvp_time_guards.sql)

DROP POLICY IF EXISTS "Allow authorized roles to INSERT events_rsvps" ON public.event_rsvps;

CREATE POLICY "Allow authorized roles to INSERT events_rsvps" ON public.event_rsvps AS permissive
  FOR INSERT TO authenticated
    WITH CHECK (public.has_permission('events.create'::public.app_permission)
    AND public.event_rsvp_window_open(event_id));

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE events_rsvps" ON public.event_rsvps;

CREATE POLICY "Allow authorized roles to UPDATE events_rsvps" ON public.event_rsvps AS permissive
  FOR UPDATE TO authenticated
    USING (public.has_permission('events.update'::public.app_permission)
      AND public.event_rsvp_window_open(event_id))
    WITH CHECK (public.has_permission('events.update'::public.app_permission)
      AND public.event_rsvp_window_open(event_id));

DROP POLICY IF EXISTS "Allow authorized roles to DELETE events_rsvps" ON public.event_rsvps;

CREATE POLICY "Allow authorized roles to DELETE events_rsvps" ON public.event_rsvps AS permissive
  FOR DELETE TO authenticated
    USING (public.has_permission('events.delete'::public.app_permission)
      AND public.event_rsvp_window_open(event_id));
