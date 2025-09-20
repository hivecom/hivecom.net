-- Add Google Calendar sync fields to events table
ALTER TABLE events
  ADD COLUMN google_event_id text,
  ADD COLUMN google_last_synced_at timestamptz;

-- Add index on google_event_id for faster lookups
CREATE INDEX idx_events_google_event_id ON events(google_event_id)
WHERE
  google_event_id IS NOT NULL;

-- Add comment to document the purpose of these fields
COMMENT ON COLUMN events.google_event_id IS 'Google Calendar event ID for syncing with Google Calendar API';

COMMENT ON COLUMN events.google_last_synced_at IS 'Timestamp of the last successful sync with Google Calendar';

