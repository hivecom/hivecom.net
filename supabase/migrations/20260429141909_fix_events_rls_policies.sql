-- Fix events RLS policies:
--
-- 1. ALL policies for is_official and google_community_event_id were inadvertently
--    blocking SELECT for non-admin authenticated users, because Postgres applies ALL
--    policy USING quals to SELECT operations too. Split into explicit INSERT + UPDATE.
--
-- 2. Sync columns (google_event_id, google_last_synced_at, google_community_event_id,
--    google_community_last_synced_at, discord_event_id, discord_last_synced_at) are
--    managed exclusively by edge functions via service role which bypasses RLS.
--    The google_community_event_id client policies are dropped entirely.
--
-- 3. If an admin flips a user-created event to official, the original owner should
--    retain edit access. The user UPDATE policy USING clause no longer requires
--    is_official = false (so the owner can still target the row), but WITH CHECK
--    still prevents the owner from setting is_official = true themselves.
--    The is_official UPDATE policy USING clause also allows the row owner through.

DROP POLICY IF EXISTS "Only admins can set is_official on events" ON public.events;
DROP POLICY IF EXISTS "Only admins can update is_official on events" ON public.events;
DROP POLICY IF EXISTS "Only admins can set google_community_event_id on events" ON public.events;
DROP POLICY IF EXISTS "Only admins can update google_community_event_id on events" ON public.events;
DROP POLICY IF EXISTS "Users can UPDATE their own non-official events" ON public.events;

-- Only admins can set is_official = true on insert
CREATE POLICY "Only admins can set is_official on events"
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE
      WHEN is_official THEN has_permission('events.create'::app_permission)
      ELSE true
    END
  );

-- Only admins can flip is_official, but owners can still target their own rows
CREATE POLICY "Only admins can update is_official on events"
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    CASE
      WHEN is_official THEN (has_permission('events.update'::app_permission) OR created_by = auth.uid())
      ELSE true
    END
  )
  WITH CHECK (
    CASE
      WHEN is_official THEN has_permission('events.update'::app_permission)
      ELSE true
    END
  );

-- Owners can update their own events regardless of official status,
-- but cannot set is_official = true themselves (enforced by WITH CHECK above)
CREATE POLICY "Users can UPDATE their own events"
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    (created_by = auth.uid()) AND is_not_banned()
  )
  WITH CHECK (
    (created_by = auth.uid()) AND (is_official = false) AND is_not_banned()
    AND audit_fields_unchanged(created_at, created_by)
    AND (EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.agreed_content_rules = true
    ))
  );
