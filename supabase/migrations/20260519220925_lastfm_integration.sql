-- Last.fm Integration
-- Adds lastfm_username to profiles, presences_lastfm table, RLS, grants,
-- queue/producer/dispatcher/cron infrastructure, and kvstore seed.
--
-- Architecture mirrors the Steam queue system:
--   pg_cron (enqueue */5 min) → queue_sync_lastfm → worker-sync-lastfm (Edge Function)
--   pg_cron (dispatch * min)  ↗

BEGIN;

-- =============================================================================
-- 1. PROFILES: add lastfm_username column
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lastfm_username text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_lastfm_username_key
  ON public.profiles (lastfm_username);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_lastfm_username_key
  UNIQUE USING INDEX profiles_lastfm_username_key;

COMMENT ON COLUMN public.profiles.lastfm_username IS 'Last.fm username for linking Last.fm accounts. Set only via edge function (service role).';

-- =============================================================================
-- 2. RLS: protect lastfm_username from self-modification
--    Re-create both update policies to include the new protected column.
-- =============================================================================

-- 2a. Self-edit policy (users updating their own profile)
DROP POLICY IF EXISTS "Users can UPDATE their information on their profiles" ON public.profiles;
CREATE POLICY "Users can UPDATE their information on their profiles"
  ON public.profiles
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = id
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
  )
  WITH CHECK (
    ((SELECT auth.uid()) = id)
    AND public.is_not_banned()
    AND public.is_aal2_if_mfa()
    AND (NOT (created_at           IS DISTINCT FROM created_at))
    AND (NOT (discord_id           IS DISTINCT FROM discord_id))
    AND (NOT (patreon_id           IS DISTINCT FROM patreon_id))
    AND (NOT (supporter_patreon    IS DISTINCT FROM supporter_patreon))
    AND (NOT (supporter_lifetime   IS DISTINCT FROM supporter_lifetime))
    AND (NOT (steam_id             IS DISTINCT FROM steam_id))
    AND (NOT (teamspeak_identities IS DISTINCT FROM teamspeak_identities))
    AND (NOT (has_banner           IS DISTINCT FROM has_banner))
    AND (NOT (banner_extension     IS DISTINCT FROM banner_extension))
    AND (NOT (lastfm_username      IS DISTINCT FROM lastfm_username))
  );

-- 2b. Admin/role policy (authorized roles updating any profile)
--     Mirrors 20260303000447 with lastfm_username added.
DROP POLICY IF EXISTS "Allow authorized roles to UPDATE profiles" ON public.profiles;
CREATE POLICY "Allow authorized roles to UPDATE profiles" ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    public.has_permission('profiles.update'::public.app_permission)
    OR public.is_profile_owner(id)
  )
  WITH CHECK (
    (
      public.has_permission('profiles.update'::public.app_permission)
      OR public.is_profile_owner(id)
    )
    AND (
      public.has_permission('users.update'::public.app_permission)
      OR (
        public.is_profile_owner(id)
        AND created_at           IS NOT DISTINCT FROM created_at
        AND modified_at          IS NOT DISTINCT FROM modified_at
        AND modified_by          IS NOT DISTINCT FROM modified_by
        AND discord_id           IS NOT DISTINCT FROM discord_id
        AND patreon_id           IS NOT DISTINCT FROM patreon_id
        AND steam_id             IS NOT DISTINCT FROM steam_id
        AND lastfm_username      IS NOT DISTINCT FROM lastfm_username
        AND supporter_patreon    IS NOT DISTINCT FROM supporter_patreon
        AND supporter_lifetime   IS NOT DISTINCT FROM supporter_lifetime
        AND banned               IS NOT DISTINCT FROM banned
        AND ban_reason           IS NOT DISTINCT FROM ban_reason
        AND ban_start            IS NOT DISTINCT FROM ban_start
        AND ban_end              IS NOT DISTINCT FROM ban_end
      )
    )
    AND (
      public.has_permission('users.update'::public.app_permission)
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.agreed_content_rules = true
      )
    )
  );

-- =============================================================================
-- 3. PRESENCES_LASTFM table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.presences_lastfm (
  profile_id    uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  lastfm_username text      NOT NULL,
  now_playing   boolean     NOT NULL DEFAULT false,
  track_name    text,
  artist_name   text,
  album_name    text,
  album_art_url text,
  track_url     text,
  played_at     timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.presences_lastfm                IS 'Latest known Last.fm presence (now-playing or last scrobbled) per profile.';
COMMENT ON COLUMN public.presences_lastfm.profile_id     IS 'Profile this presence belongs to.';
COMMENT ON COLUMN public.presences_lastfm.lastfm_username IS 'Last.fm username at time of last sync.';
COMMENT ON COLUMN public.presences_lastfm.now_playing    IS 'True when the track is currently being scrobbled.';
COMMENT ON COLUMN public.presences_lastfm.track_name     IS 'Track title.';
COMMENT ON COLUMN public.presences_lastfm.artist_name    IS 'Primary artist name.';
COMMENT ON COLUMN public.presences_lastfm.album_name     IS 'Album name.';
COMMENT ON COLUMN public.presences_lastfm.album_art_url  IS 'Resolved album art URL (from Deezer or iTunes Search; not from Last.fm directly).';
COMMENT ON COLUMN public.presences_lastfm.track_url      IS 'Last.fm URL for the track.';
COMMENT ON COLUMN public.presences_lastfm.played_at      IS 'Unix-timestamp-derived time of the last completed scrobble (null when now_playing is true).';
COMMENT ON COLUMN public.presences_lastfm.updated_at     IS 'Timestamp of the last sync from the worker.';

CREATE INDEX IF NOT EXISTS presences_lastfm_profile_id_idx
  ON public.presences_lastfm (profile_id);

-- =============================================================================
-- 4. RLS for presences_lastfm
-- =============================================================================

ALTER TABLE public.presences_lastfm ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can SELECT Last.fm presences"
  ON public.presences_lastfm
  FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "Service role can manage Last.fm presences"
  ON public.presences_lastfm
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- =============================================================================
-- 5. GRANTS
-- =============================================================================

GRANT SELECT ON public.presences_lastfm TO authenticated;

-- =============================================================================
-- 6. DELETE presence on unlink (mirror presences_steam_delete_on_unlink)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_lastfm_presence_on_unlink()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  IF OLD.lastfm_username IS NOT NULL AND NEW.lastfm_username IS NULL THEN
    DELETE FROM public.presences_lastfm
    WHERE profile_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.delete_lastfm_presence_on_unlink() IS 'Deletes the presences_lastfm row when a user unlinks their Last.fm account.';

CREATE TRIGGER on_lastfm_unlink_delete_presence
  AFTER UPDATE OF lastfm_username
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_lastfm_presence_on_unlink();

-- =============================================================================
-- 7. QUEUE SETUP
-- =============================================================================

SELECT FROM pgmq.create('queue_sync_lastfm');

-- =============================================================================
-- 8. KVSTORE: seed worker config
-- =============================================================================

INSERT INTO private.kvstore (key, value, type)
  VALUES (
    'worker_sync_lastfm',
    '{
      "max_wall_clock_ms": 50000,
      "batch_size": 50,
      "visibility_timeout_sec": 60,
      "max_concurrency": 10
    }'::jsonb,
    'JSON'
  )
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  modified_at = NOW();

-- =============================================================================
-- 9. PRODUCER: enqueue Last.fm jobs (every 5 minutes)
-- =============================================================================

CREATE OR REPLACE FUNCTION private.queue_enqueue_worker_sync_lastfm()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pgmq
  AS $$
DECLARE
  profile_record RECORD;
  messages       jsonb[] := '{}';
  batch_count    int     := 0;
BEGIN
  FOR profile_record IN
    SELECT id, lastfm_username
    FROM public.profiles
    WHERE lastfm_username IS NOT NULL
      AND rich_presence_enabled = TRUE
  LOOP
    messages := messages || jsonb_build_object(
      'profile_id',      profile_record.id,
      'lastfm_username', profile_record.lastfm_username
    );
    batch_count := batch_count + 1;

    IF batch_count >= 100 THEN
      PERFORM pgmq.send_batch('queue_sync_lastfm', messages);
      messages    := '{}';
      batch_count := 0;
    END IF;
  END LOOP;

  IF batch_count > 0 THEN
    PERFORM pgmq.send_batch('queue_sync_lastfm', messages);
  END IF;
END;
$$;

COMMENT ON FUNCTION private.queue_enqueue_worker_sync_lastfm() IS 'Enqueues profiles with lastfm_username and rich_presence_enabled into queue_sync_lastfm for background processing.';

SELECT cron.schedule(
  'queue_enqueue_sync_lastfm',
  '*/5 * * * *',
  $$ SELECT private.queue_enqueue_worker_sync_lastfm(); $$
);

-- =============================================================================
-- 10. DISPATCHER: fire worker Edge Functions (every 1 minute)
-- =============================================================================

CREATE OR REPLACE FUNCTION private.queue_dispatch_worker_sync_lastfm()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, private, pgmq, net, vault
  AS $$
DECLARE
  config           jsonb;
  queue_depth      bigint;
  batch_size       int;
  max_concurrency  int;
  workers_needed   int;
  workers_to_fire  int;
  project_url      text;
  anon_key         text;
  cron_secret      text;
  i                int;
BEGIN
  SELECT value INTO config
  FROM private.kvstore
  WHERE key = 'worker_sync_lastfm';

  IF config IS NULL THEN
    config := '{"batch_size": 10, "max_concurrency": 5}'::jsonb;
  END IF;

  batch_size      := COALESCE((config ->> 'batch_size')::int, 10);
  max_concurrency := COALESCE((config ->> 'max_concurrency')::int, 5);

  SELECT queue_length INTO queue_depth
  FROM pgmq.metrics('queue_sync_lastfm');

  IF queue_depth IS NULL OR queue_depth = 0 THEN
    RETURN;
  END IF;

  workers_needed  := CEIL(queue_depth::numeric / batch_size);
  workers_to_fire := LEAST(workers_needed, max_concurrency);

  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets WHERE name = 'project_url';

  SELECT decrypted_secret INTO anon_key
  FROM vault.decrypted_secrets WHERE name = 'anon_key';

  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets WHERE name = 'system_cron_secret';

  IF project_url IS NULL OR anon_key IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'Missing vault secrets for lastfm worker dispatch';
    RETURN;
  END IF;

  FOR i IN 1..workers_to_fire LOOP
    PERFORM net.http_post(
      url     := project_url || '/functions/v1/worker-sync-lastfm',
      headers := jsonb_build_object(
        'Content-Type',       'application/json',
        'Authorization',      'Bearer ' || anon_key,
        'System-Cron-Secret', cron_secret
      ),
      body    := jsonb_build_object('worker_id', i, 'dispatched_at', NOW())
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION private.queue_dispatch_worker_sync_lastfm() IS 'Dispatches worker-sync-lastfm Edge Functions based on queue depth and configuration.';

SELECT cron.schedule(
  'queue_dispatch_sync_lastfm',
  '* * * * *',
  $$ SELECT private.queue_dispatch_worker_sync_lastfm(); $$
);

COMMIT;
