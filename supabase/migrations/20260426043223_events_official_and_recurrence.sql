-- ============================================================
-- 1. Add new columns to events
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_rule text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id bigint DEFAULT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recurrence_exception boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.is_official IS 'Whether this is an official event created/approved by an admin or moderator. Only official events are synced to Discord and Google Calendar.';
COMMENT ON COLUMN public.events.recurrence_rule IS 'iCal RRULE string defining the recurrence pattern for this event (e.g. FREQ=WEEKLY;BYDAY=SA). NULL means a one-off event.';
COMMENT ON COLUMN public.events.recurrence_parent_id IS 'For manually created exception/override rows only: the ID of the parent event that defines the recurrence rule. There is NO automatic generation of child occurrence rows - a recurring event is a single row with a recurrence_rule and a date representing the current/next occurrence.';
COMMENT ON COLUMN public.events.recurrence_exception IS 'When true this occurrence is a one-off exception/override within a recurring series (e.g. a cancelled or rescheduled week).';

-- Backfill: all pre-existing events are official
UPDATE public.events SET is_official = true;

-- ============================================================
-- 2. Drop existing events INSERT/UPDATE/DELETE policies
-- ============================================================

DROP POLICY IF EXISTS "Allow authorized roles to INSERT events" ON public.events;
DROP POLICY IF EXISTS "Allow authorized roles to UPDATE events" ON public.events;
DROP POLICY IF EXISTS "Allow authorized roles to DELETE events" ON public.events;

-- ============================================================
-- 3. Admins / moderators: full INSERT / UPDATE / DELETE
-- ============================================================

CREATE POLICY "Admins can INSERT events"
  ON public.events
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission('events.create'::app_permission));

CREATE POLICY "Admins can UPDATE events"
  ON public.events
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (has_permission('events.update'::app_permission))
  WITH CHECK (has_permission('events.update'::app_permission) AND audit_fields_unchanged(created_at, created_by));

CREATE POLICY "Admins can DELETE events"
  ON public.events
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (has_permission('events.delete'::app_permission));

-- ============================================================
-- 4. Authenticated users: INSERT their own non-official events
-- ============================================================

CREATE POLICY "Users can INSERT non-official events"
  ON public.events
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_official = false
    AND created_by = auth.uid()
    AND is_not_banned()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

-- ============================================================
-- 5. Authenticated users: UPDATE their own non-official events
--    They must not be able to flip is_official to true.
-- ============================================================

CREATE POLICY "Users can UPDATE their own non-official events"
  ON public.events
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND is_official = false
    AND is_not_banned()
  )
  WITH CHECK (
    created_by = auth.uid()
    AND is_official = false
    AND is_not_banned()
    AND audit_fields_unchanged(created_at, created_by)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

-- ============================================================
-- 6. Authenticated users: DELETE their own non-official events
-- ============================================================

CREATE POLICY "Users can DELETE their own non-official events"
  ON public.events
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND is_official = false
    AND is_not_banned()
  );

-- ============================================================
-- 7. Restrictive policy: prevent any non-admin from ever setting
--    is_official = true, regardless of other permissive policies.
-- ============================================================

CREATE POLICY "Only admins can set is_official on events"
  ON public.events
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    CASE WHEN is_official THEN has_permission('events.update'::app_permission) ELSE true END
  )
  WITH CHECK (
    CASE WHEN is_official THEN has_permission('events.create'::app_permission) ELSE true END
  );
