-- Connect templates move the per-game launch logic out of the frontend
-- (app/composables/useGameConnect.ts used to hardcode a set of shorthands) and
-- into data, so adding a game no longer needs a deploy.
--
-- Two independent templates, because they serve different actions:
--   connect_uri     - what the Launch button navigates to
--   connect_command - console/launch args, shown as copyable text
--
-- Tokens substituted at render time:
--   {address}   - one entry from network_gameservers.addresses
--   {port}      - network_gameservers.port
--   {steam_id}  - games.steam_id
--   {command}   - the substituted connect_command, URL-encoded (connect_uri only)
--
-- Examples:
--   Team Fortress 2  uri 'steam://connect/{address}:{port}'
--                    cmd 'connect {address}:{port}'
--   Cobalt           uri 'steam://rungameid/{steam_id}//{command}'
--                    cmd '+connect {address}:{port}'
--
-- Steam's connect handler only knows a subset of games, and a rungameid call is
-- ignored when the game is already running. That is why the URI shape stays
-- explicit per game rather than being derived from steam_id.

ALTER TABLE public.games
  ADD COLUMN connect_uri text
    CONSTRAINT games_connect_uri_scheme_check
    CHECK (connect_uri IS NULL OR connect_uri ~ '^(steam|minecraft|ts3server|https)://'),
  ADD COLUMN connect_command text;

ALTER TABLE public.network_gameservers
  ADD COLUMN connect_command text;

COMMENT ON COLUMN public.games.connect_uri IS 'URI template for direct launch. Tokens: {address}, {port}, {steam_id}, {command}. NULL means the server is copy-only. Scheme is constrained since this value is navigated to.';
COMMENT ON COLUMN public.games.connect_command IS 'Console or launch-argument template shown as copyable text. Tokens: {address}, {port}. NULL means no command to show.';
COMMENT ON COLUMN public.network_gameservers.connect_command IS 'Per-server override of games.connect_command, for servers needing extra arguments. NULL inherits the game default. Do not put secrets here - the row is publicly readable.';
