-- Restrict unofficial events to authenticated users only.
-- Anon users can only see official events (is_official = true).
-- Logged-in users see all events.

DROP POLICY IF EXISTS "Everyone can SELECT events" ON public.events;

CREATE POLICY "Authenticated users can SELECT all events"
  ON public.events
  FOR SELECT
  USING (
    is_official = true
    OR auth.uid() IS NOT NULL
  );
