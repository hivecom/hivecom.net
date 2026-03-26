-- Enable realtime for notifications so clients can subscribe to INSERT events
-- and receive new notifications without polling.
--
-- Notes:
-- - We only subscribe to INSERT events on the client, filtered by user_id.
-- - INSERT events include the full new row payload by default, so the
--   user_id filter can be evaluated without REPLICA IDENTITY FULL.
-- - REPLICA IDENTITY FULL is not needed here - we have no UPDATE/DELETE
--   realtime subscriptions on this table.

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
