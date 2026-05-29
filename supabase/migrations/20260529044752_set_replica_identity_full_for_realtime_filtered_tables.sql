-- Supabase Realtime rejects row-level filters on non-primary-key columns
-- unless the table has REPLICA IDENTITY FULL. Both tables use non-PK column
-- filters on the client:
--
--   profile_friends:    filter = `friend=eq.<uid>`      (INSERT subscription)
--   user_notifications: filter = `user_id=eq.<uid>`     (INSERT subscription)
--
-- The original realtime migrations noted FULL wasn't needed for INSERT-only
-- subscriptions, but in practice Supabase Realtime still validates the filter
-- column against the replica identity and rejects it with "invalid column for
-- filter" when set to DEFAULT (primary key only).
--
-- Setting FULL causes Postgres to include all column values in WAL events,
-- which lets Realtime evaluate any column filter.

ALTER TABLE public.profile_friends    REPLICA IDENTITY FULL;
ALTER TABLE public.user_notifications REPLICA IDENTITY FULL;
