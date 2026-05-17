-- Rename table events_rsvps to event_rsvps to be consistent with all other table names.

ALTER TABLE public.events_rsvps RENAME TO event_rsvps;

-- Rename indexes
ALTER INDEX IF EXISTS events_rsvps_pkey RENAME TO event_rsvps_pkey;
ALTER INDEX IF EXISTS events_rsvps_user_event_key RENAME TO event_rsvps_user_event_key;
ALTER INDEX IF EXISTS events_rsvps_user_event_scope_occurrence_key RENAME TO event_rsvps_user_event_scope_occurrence_key;
ALTER INDEX IF EXISTS idx_events_rsvps_event_id RENAME TO idx_event_rsvps_event_id;
ALTER INDEX IF EXISTS idx_events_rsvps_user_id RENAME TO idx_event_rsvps_user_id;
ALTER INDEX IF EXISTS idx_events_rsvps_rsvp RENAME TO idx_event_rsvps_rsvp;
ALTER INDEX IF EXISTS idx_events_rsvps_created_by RENAME TO idx_event_rsvps_created_by;
ALTER INDEX IF EXISTS idx_events_rsvps_modified_by RENAME TO idx_event_rsvps_modified_by;

-- Rename trigger
ALTER TRIGGER update_events_rsvps_audit_fields ON public.event_rsvps RENAME TO update_event_rsvps_audit_fields;
