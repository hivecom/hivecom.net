-- Add the Trackmania query protocol to the game_query_protocol enum.
-- docker-control now speaks GBXRemote, the TrackMania Forever dedicated
-- server's XML-RPC interface. It needs the server's User level password,
-- stored per gameserver in Vault like the Factorio RCON password.
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot be used in the same transaction that
-- also uses the new value. This migration only adds the label.

ALTER TYPE public.game_query_protocol ADD VALUE IF NOT EXISTS 'trackmania';

COMMENT ON TYPE public.game_query_protocol IS 'Supported game server query protocols. source = Valve A2S_INFO (Source Engine), minecraft = Minecraft UT3/GameSpy query protocol, gamespy1 = legacy text GameSpy v1 (UT99/UT2004), satisfactory = Satisfactory Lightweight Query API (run state and name only, no player counts), factorio = Factorio via Source RCON (requires a per-server RCON secret stored in Vault), trackmania = TrackMania Forever via GBXRemote XML-RPC (requires the per-server User password stored in Vault).';
