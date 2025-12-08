-- TeamSpeak linking storage and protections
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.teamspeak_tokens(
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unique_id text NOT NULL,
  server_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  expires_at timestamptz NOT NULL DEFAULT TIMEZONE('utc', NOW()) + interval '15 minutes',
  attempts smallint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS teamspeak_tokens_expires_at_idx ON private.teamspeak_tokens(expires_at);

-- Allow only the service role to access the private schema objects
GRANT USAGE ON SCHEMA private TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA private TO service_role;

GRANT ALL ON ALL ROUTINES IN SCHEMA private TO service_role;

GRANT ALL ON ALL SEQUENCES IN SCHEMA private TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private GRANT ALL ON ROUTINES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private GRANT ALL ON SEQUENCES TO service_role;

ALTER TABLE private.teamspeak_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teamspeak_tokens service role only" ON private.teamspeak_tokens
  FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teamspeak_identities jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Preserve the self-update policy name and extend it to forbid changing teamspeak_identities for authenticated users
DROP POLICY IF EXISTS "Users can UPDATE their information on their profiles" ON public.profiles;

CREATE POLICY "Users can UPDATE their information on their profiles" ON public.profiles AS permissive
  FOR UPDATE TO authenticated
    USING ((auth.uid() = id))
    WITH CHECK ((auth.uid() = id)
      AND (NOT (created_at IS DISTINCT FROM created_at))
      AND (NOT (discord_id IS DISTINCT FROM discord_id))
      AND (NOT (patreon_id IS DISTINCT FROM patreon_id))
      AND (NOT (supporter_patreon IS DISTINCT FROM supporter_patreon))
      AND (NOT (supporter_lifetime IS DISTINCT FROM supporter_lifetime))
      AND (NOT (steam_id IS DISTINCT FROM steam_id))
      AND (NOT (badges IS DISTINCT FROM badges))
      AND (NOT (teamspeak_identities IS DISTINCT FROM teamspeak_identities)));

