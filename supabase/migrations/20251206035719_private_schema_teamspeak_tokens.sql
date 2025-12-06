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

ALTER TABLE private.teamspeak_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teamspeak_tokens service role only" ON private.teamspeak_tokens
  FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teamspeak_identities jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.block_user_teamspeak_identity_update()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  IF auth.role() IN('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Only privileged services can change TeamSpeak identities.';
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS protect_teamspeak_identities ON public.profiles;

CREATE TRIGGER protect_teamspeak_identities
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN(new.teamspeak_identities IS DISTINCT FROM old.teamspeak_identities)
  EXECUTE FUNCTION public.block_user_teamspeak_identity_update();

