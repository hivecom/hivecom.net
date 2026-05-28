CREATE TYPE public.game_query_protocol AS ENUM ('source');

ALTER TABLE public.gameservers
  DROP CONSTRAINT gameservers_query_protocol_check;

ALTER TABLE public.gameservers
  ALTER COLUMN query_protocol TYPE public.game_query_protocol
  USING query_protocol::text::public.game_query_protocol;

COMMENT ON COLUMN public.gameservers.query_protocol IS 'Game server query protocol used for player count polling. NULL means no querying. Supported values are defined in the game_query_protocol enum.';
