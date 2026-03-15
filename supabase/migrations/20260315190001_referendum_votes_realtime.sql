-- Enable REPLICA IDENTITY FULL on referendum_votes so that UPDATE and DELETE
-- realtime events include all columns in the old record.
--
-- Without this, DELETE events only carry the primary key in `old`, which means
-- the Supabase realtime filter `referendum_id=eq.<id>` cannot be evaluated and
-- clients never receive deletion events on their per-referendum channel.
--
-- The referendum_votes table is narrow and vote write volume is low,
-- so the modest WAL amplification cost is acceptable here.

ALTER TABLE public.referendum_votes REPLICA IDENTITY FULL;

-- Add referendum_votes to the supabase_realtime publication so clients can
-- subscribe to row-level changes on this table.
ALTER PUBLICATION supabase_realtime ADD TABLE public.referendum_votes;
