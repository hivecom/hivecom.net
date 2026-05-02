ALTER TABLE public.gameservers
  ADD COLUMN query_protocol text
    CONSTRAINT gameservers_query_protocol_check CHECK (query_protocol IS NULL OR query_protocol IN ('source')),
  ADD COLUMN query_port integer;

COMMENT ON COLUMN public.gameservers.query_protocol IS 'Game server query protocol used for player count polling. NULL means no querying. Currently supported: source.';
COMMENT ON COLUMN public.gameservers.query_port IS 'UDP/TCP port used for game server queries. If NULL, falls back to the game server port field.';
