-- Add the newly supported docker-control query protocols to the
-- game_query_protocol enum. docker-control now speaks:
--   gamespy1     - legacy text GameSpy v1 (UT99, UT2004)
--   satisfactory - Satisfactory Lightweight Query API (state + name only)
--   factorio     - Factorio via Source RCON (requires a per-server RCON secret)
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot be used in the same transaction that
-- also uses the new value. These statements only add the labels; nothing in
-- this migration references them, so it is safe.

ALTER TYPE public.game_query_protocol ADD VALUE IF NOT EXISTS 'gamespy1';
ALTER TYPE public.game_query_protocol ADD VALUE IF NOT EXISTS 'satisfactory';
ALTER TYPE public.game_query_protocol ADD VALUE IF NOT EXISTS 'factorio';

COMMENT ON TYPE public.game_query_protocol IS 'Supported game server query protocols. source = Valve A2S_INFO (Source Engine), minecraft = Minecraft UT3/GameSpy query protocol, gamespy1 = legacy text GameSpy v1 (UT99/UT2004), satisfactory = Satisfactory Lightweight Query API (run state and name only, no player counts), factorio = Factorio via Source RCON (requires a per-server RCON secret stored in Vault).';
