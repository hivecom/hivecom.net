-- Enable REPLICA IDENTITY FULL on events_rsvps so that UPDATE and DELETE
-- realtime events include all columns in the old record.
--
-- Without this, DELETE events only carry the primary key in `old`, which means
-- the Supabase realtime filter `event_id=eq.<id>` cannot be evaluated and
-- clients never receive deletion events on their per-event channel.
--
-- The events_rsvps table is narrow (8 columns) and RSVP write volume is low,
-- so the modest WAL amplification cost is acceptable here.

ALTER TABLE public.events_rsvps REPLICA IDENTITY FULL;

-- Add events_rsvps to the supabase_realtime publication so clients can
-- subscribe to row-level changes on this table.
ALTER PUBLICATION supabase_realtime ADD TABLE public.events_rsvps;
