-- Rich presence schema: structured tables per service, locked to service role writes, readable to authenticated users.
BEGIN;
-- User-facing toggle to disable rich presence collection
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rich_presence_disabled boolean NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN public.profiles.rich_presence_disabled IS 'User toggle to disable rich presence collection across services.';
-- TeamSpeak presence (one row per profile/server, latest known presence)
CREATE TABLE IF NOT EXISTS public.presences_teamspeak(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  server_id text NOT NULL,
  channel_id text,
  channel_name text,
  channel_path text[],
  last_seen_at timestamptz,
  status text,
  details jsonb,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, server_id)
);
COMMENT ON TABLE public.presences_teamspeak IS 'Latest known TeamSpeak presence per profile/server.';
COMMENT ON COLUMN public.presences_teamspeak.details IS 'Optional extra fields from the TeamSpeak query payload.';
CREATE INDEX IF NOT EXISTS presences_teamspeak_profile_id_idx ON public.presences_teamspeak(profile_id);
CREATE INDEX IF NOT EXISTS presences_teamspeak_server_id_idx ON public.presences_teamspeak(server_id);
CREATE INDEX IF NOT EXISTS presences_teamspeak_channel_id_idx ON public.presences_teamspeak(channel_id);
-- Discord presence (latest snapshot per profile)
CREATE TABLE IF NOT EXISTS public.presences_discord(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text,
  activity_name text,
  activity_type text,
  activity_details text,
  activity_state text,
  activity_started_at timestamptz,
  activity_ended_at timestamptz,
  last_online_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  details jsonb,
  UNIQUE (profile_id)
);
COMMENT ON TABLE public.presences_discord IS 'Latest known Discord presence per profile.';
COMMENT ON COLUMN public.presences_discord.details IS 'Optional extra fields from the Discord presence payload.';
CREATE INDEX IF NOT EXISTS presences_discord_profile_id_idx ON public.presences_discord(profile_id);
CREATE INDEX IF NOT EXISTS presences_discord_status_idx ON public.presences_discord(status);
CREATE INDEX IF NOT EXISTS presences_discord_activity_name_idx ON public.presences_discord(activity_name);
-- Steam presence (latest snapshot per profile)
CREATE TABLE IF NOT EXISTS public.presences_steam(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text,
  last_online_at timestamptz,
  last_app_id bigint,
  last_app_name text,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  details jsonb,
  UNIQUE (profile_id)
);
COMMENT ON TABLE public.presences_steam IS 'Latest known Steam presence per profile.';
COMMENT ON COLUMN public.presences_steam.details IS 'Optional extra fields from the Steam presence payload.';
CREATE INDEX IF NOT EXISTS presences_steam_profile_id_idx ON public.presences_steam(profile_id);
CREATE INDEX IF NOT EXISTS presences_steam_status_idx ON public.presences_steam(status);
CREATE INDEX IF NOT EXISTS presences_steam_last_app_id_idx ON public.presences_steam(last_app_id);
-- RLS: allow read to authenticated users; write only to service_role
ALTER TABLE public.presences_teamspeak ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presences_discord ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presences_steam ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'presences_teamspeak'
      AND policyname = 'presences_teamspeak_select_authenticated') THEN
  CREATE POLICY presences_teamspeak_select_authenticated ON public.presences_teamspeak
    FOR SELECT
      USING(auth.role( ) = 'authenticated' );
END IF;
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'presences_discord'
      AND policyname = 'presences_discord_select_authenticated') THEN
  CREATE POLICY presences_discord_select_authenticated ON public.presences_discord
    FOR SELECT
      USING(auth.role( ) = 'authenticated' );
END IF;
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'presences_steam'
      AND policyname = 'presences_steam_select_authenticated') THEN
  CREATE POLICY presences_steam_select_authenticated ON public.presences_steam
    FOR SELECT
      USING(auth.role( ) = 'authenticated' );
END IF;
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'presences_teamspeak'
      AND policyname = 'presences_teamspeak_service_writes') THEN
  CREATE POLICY presences_teamspeak_service_writes ON public.presences_teamspeak
    FOR ALL
      USING(auth.role( ) = 'service_role' )
      WITH CHECK(auth.role( ) = 'service_role' );
END IF;
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'presences_discord'
      AND policyname = 'presences_discord_service_writes') THEN
  CREATE POLICY presences_discord_service_writes ON public.presences_discord
    FOR ALL
      USING(auth.role( ) = 'service_role' )
      WITH CHECK(auth.role( ) = 'service_role' );
END IF;
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_policies
    WHERE
      schemaname = 'public'
      AND tablename = 'presences_steam'
      AND policyname = 'presences_steam_service_writes') THEN
  CREATE POLICY presences_steam_service_writes ON public.presences_steam
    FOR ALL
      USING(auth.role( ) = 'service_role' )
      WITH CHECK(auth.role( ) = 'service_role' );
END IF;
END
$$;
COMMIT;
