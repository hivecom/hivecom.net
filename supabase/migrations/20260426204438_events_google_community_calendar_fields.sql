ALTER TABLE public.events
  ADD COLUMN google_community_event_id text,
  ADD COLUMN google_community_last_synced_at timestamptz;

-- Index for faster lookups, matching the existing google_event_id index pattern
CREATE INDEX idx_events_google_community_event_id ON public.events(google_community_event_id)
  WHERE google_community_event_id IS NOT NULL;

COMMENT ON COLUMN public.events.google_community_event_id IS 'Google Calendar event ID for the community calendar sync.';
COMMENT ON COLUMN public.events.google_community_last_synced_at IS 'Timestamp of the last successful sync with the community Google Calendar.';

-- Guard: only admins/service_role can write these sync fields.
-- Regular users have no business setting Google Calendar IDs directly.
CREATE POLICY "Only admins can set google_community_event_id on events"
  ON public.events
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    CASE
      WHEN google_community_event_id IS NOT NULL THEN has_permission('events.update'::app_permission)
      ELSE true
    END
  )
  WITH CHECK (
    CASE
      WHEN google_community_event_id IS NOT NULL THEN has_permission('events.create'::app_permission)
      ELSE true
    END
  );
