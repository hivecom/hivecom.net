-- Enable REPLICA IDENTITY FULL on discussion_replies so that UPDATE and DELETE
-- realtime events include all columns in the old record.
--
-- Without this, DELETE events only carry the primary key in `old`, which means
-- the Supabase realtime filter `discussion_id=eq.<id>` cannot be evaluated and
-- clients never receive deletion events on their per-discussion channel.
--
-- UPDATE events already include the full new row by default, but REPLICA IDENTITY
-- FULL also ensures the old row is fully populated - useful if we ever need to
-- diff old vs new on the client side.
--
-- There is a modest WAL write amplification cost (all column values are written
-- on every update/delete instead of just changed ones), but discussion_replies
-- rows are narrow and write volume is low, so this is acceptable.

ALTER TABLE public.discussion_replies REPLICA IDENTITY FULL;
