-- The "Only admins can set/update is_official" policies were converted from
-- RESTRICTIVE to PERMISSIVE in 20260429141909_fix_events_rls_policies.sql.
-- As PERMISSIVE, CASE WHEN is_official THEN ... ELSE true END always passes for
-- non-official rows, making the guard a no-op. Restoring AS RESTRICTIVE makes
-- these policies act as a ceiling (AND'd against permissive policies) as intended.

DROP POLICY IF EXISTS "Only admins can set is_official on events" ON public.events;

CREATE POLICY "Only admins can set is_official on events"
  ON public.events
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE
      WHEN is_official THEN has_permission('events.create'::app_permission)
      ELSE true
    END
  );

DROP POLICY IF EXISTS "Only admins can update is_official on events" ON public.events;

CREATE POLICY "Only admins can update is_official on events"
  ON public.events
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    CASE
      WHEN is_official THEN (has_permission('events.update'::app_permission) OR (created_by = (SELECT auth.uid())))
      ELSE true
    END
  )
  WITH CHECK (
    CASE
      WHEN is_official THEN has_permission('events.update'::app_permission)
      ELSE true
    END
  );
