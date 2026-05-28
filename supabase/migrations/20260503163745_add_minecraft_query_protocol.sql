ALTER TYPE public.game_query_protocol ADD VALUE IF NOT EXISTS 'minecraft';

COMMENT ON TYPE public.game_query_protocol IS 'Supported game server query protocols. source = Valve A2S_INFO (Source Engine), minecraft = Minecraft UT3/GameSpy query protocol.';
