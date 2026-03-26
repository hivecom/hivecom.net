-- Enable realtime for friends so clients can subscribe to INSERT events
-- and receive friend request notifications without polling.
--
-- Notes:
-- - We only subscribe to INSERT events on the client, filtered by friend (the recipient).
-- - INSERT events include the full new row payload by default, so the
--   friend filter can be evaluated without REPLICA IDENTITY FULL.
-- - REPLICA IDENTITY FULL is not needed here - we have no UPDATE/DELETE
--   realtime subscriptions on this table.

ALTER PUBLICATION supabase_realtime ADD TABLE public.friends;
