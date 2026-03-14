-- Enable realtime for discussion_replies so the Discussion component can
-- subscribe to INSERT events and notify users of new replies without polling.
--
-- Notes:
-- - INSERT events with a discussion_id filter do not require REPLICA IDENTITY FULL
--   because the filtered column is present in the new row payload by default.
-- - REPLICA IDENTITY FULL is only needed for UPDATE/DELETE filters on non-PK columns.
--   We are only subscribing to INSERT events, so the default identity is sufficient.

ALTER PUBLICATION supabase_realtime ADD TABLE public.discussion_replies;
