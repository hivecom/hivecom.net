-- Supabase Realtime needs REPLICA IDENTITY FULL to evaluate row-level filters
-- on non-primary-key columns in WAL events. Both tables use non-PK column
-- filters on the client:
--
--   profile_friends:    filter = `friend=eq.<uid>`      (INSERT subscription)
--   user_notifications: filter = `user_id=eq.<uid>`     (INSERT subscription)
--
-- Note: this does not address the "invalid column for filter" error. That one
-- comes from realtime.subscription_check_filters and means the subscribing
-- JWT role has no SELECT privilege on the filter column, which happens when a
-- channel is still joined while the client signs out and Realtime re-validates
-- it under the anon role. The client tears channels down before signing out
-- to avoid it.
--
-- Setting FULL causes Postgres to include all column values in WAL events,
-- which lets Realtime evaluate any column filter.

ALTER TABLE public.profile_friends    REPLICA IDENTITY FULL;
ALTER TABLE public.user_notifications REPLICA IDENTITY FULL;
