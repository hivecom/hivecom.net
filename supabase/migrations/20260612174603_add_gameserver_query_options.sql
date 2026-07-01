-- Non-secret, per-gameserver query configuration. Secrets (e.g. the Factorio
-- RCON password) are NOT stored here - they live in Vault and are accessed via
-- the get/set_gameserver_query_secret functions (see the following migration).
--
-- Current shape (see types/database.overrides.ts -> network_gameservers):
--   { "factorioUseLua": boolean }   -- opt-in: also fetch player names + max
--                                      players for Factorio (disables save
--                                      achievements, so it is off by default).

ALTER TABLE public.network_gameservers
  ADD COLUMN IF NOT EXISTS query_options jsonb;

COMMENT ON COLUMN public.network_gameservers.query_options IS 'Non-secret, protocol-specific query configuration as JSON. Secrets are stored in Vault, not here. Known keys: factorioUseLua (boolean) - opt into Factorio RCON Lua mode for player names and max players.';
