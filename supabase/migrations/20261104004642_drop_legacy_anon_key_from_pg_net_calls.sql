-- Stop sending the legacy anon JWT on internal edge function calls. Since
-- around 00:30 UTC on 2026-11-03 the gateway rejects any request carrying a
-- legacy key with 401 "Legacy API keys are disabled", even for functions
-- deployed with verify_jwt = false. Every pg_net call failed: metrics,
-- TeamSpeak sync, the status banner, the Steam/Last.fm workers, push
-- notifications and the event/media/avatar triggers.
--
-- These functions have verify_jwt = false, so the gateway needs no key at all.
-- System-Cron-Secret / System-Trigger-Secret remain the auth gate. Once this
-- is live the anon_key vault secret has no readers and can be deleted.

-- ── Cron jobs ──
-- cron.schedule with an existing jobname updates the job in place.

SELECT cron.schedule('cron-metrics-fetch', '*/5 * * * *', $$
  SELECT
    net.http_post(
      url := (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'
      ) || '/functions/v1/cron-metrics-fetch',
      headers := jsonb_build_object(
        'Content-Type',       'application/json',
        'System-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'system_cron_secret')
      ),
      body := CONCAT('{"time": "', NOW(), '"}')::jsonb,
      timeout_milliseconds := 15000
    ) AS request_id;
$$);

SELECT cron.schedule('cron-render-status-banner', '*/5 * * * *', $$
  SELECT
    net.http_post(
      url := (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'
      ) || '/functions/v1/cron-render-status-banner',
      headers := jsonb_build_object(
        'Content-Type',       'application/json',
        'System-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'system_cron_secret')
      ),
      body := CONCAT('{"time": "', NOW(), '"}')::jsonb,
      timeout_milliseconds := 15000
    ) AS request_id;
$$);

SELECT cron.schedule('cron-teamspeak-sync', '*/15 * * * *', $$
  SELECT
    net.http_post(
      url := (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'
      ) || '/functions/v1/cron-teamspeak-sync',
      headers := jsonb_build_object(
        'Content-Type',       'application/json',
        'System-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'system_cron_secret')
      ),
      body := jsonb_build_object('time', NOW()),
      timeout_milliseconds := 15000
    ) AS request_id;
$$);

SELECT cron.schedule('cron-docker-control-container-fetch', '30 * * * *', $$
  SELECT
    net.http_post(
      url := (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'
      ) || '/functions/v1/cron-docker-control-container-fetch',
      headers := jsonb_build_object(
        'Content-Type',       'application/json',
        'System-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'system_cron_secret')
      ),
      body := CONCAT('{"time": "', NOW(), '"}')::jsonb,
      timeout_milliseconds := 15000
    ) AS request_id;
$$);

SELECT cron.schedule('cron-patreon-fetch', '0 0 * * *', $$
  SELECT
    net.http_post(
      url := (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'
      ) || '/functions/v1/cron-patreon-fetch',
      headers := jsonb_build_object(
        'Content-Type',       'application/json',
        'System-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'system_cron_secret')
      ),
      body := CONCAT('{"time": "', NOW(), '"}')::jsonb,
      timeout_milliseconds := 15000
    ) AS request_id;
$$);

-- ── Queue dispatchers ──

CREATE OR REPLACE FUNCTION private.queue_dispatch_worker_sync_steam()
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
  cron_secret      text;
  i                int;
BEGIN
  SELECT value INTO config
  FROM private.kvstore
  WHERE key = 'worker_sync_steam';

  IF config IS NULL THEN
    config := '{"batch_size": 10, "max_concurrency": 5}'::jsonb;
  END IF;

  batch_size      := COALESCE((config ->> 'batch_size')::int, 10);
  max_concurrency := COALESCE((config ->> 'max_concurrency')::int, 5);

  SELECT queue_length INTO queue_depth
  FROM pgmq.metrics('queue_sync_steam');

  IF queue_depth IS NULL OR queue_depth = 0 THEN
    RETURN;
  END IF;

  workers_needed  := CEIL(queue_depth::numeric / batch_size);
  workers_to_fire := LEAST(workers_needed, max_concurrency);

  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets WHERE name = 'project_url';

  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets WHERE name = 'system_cron_secret';

  IF project_url IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'Missing vault secrets for steam worker dispatch';
    RETURN;
  END IF;

  FOR i IN 1..workers_to_fire LOOP
    PERFORM net.http_post(
      url     := project_url || '/functions/v1/worker-sync-steam',
      headers := jsonb_build_object(
        'Content-Type',       'application/json',
        'System-Cron-Secret', cron_secret
      ),
      body    := jsonb_build_object('worker_id', i, 'dispatched_at', NOW()),
      timeout_milliseconds := 15000
    );
  END LOOP;
END;
$$;

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

  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets WHERE name = 'system_cron_secret';

  IF project_url IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'Missing vault secrets for lastfm worker dispatch';
    RETURN;
  END IF;

  FOR i IN 1..workers_to_fire LOOP
    PERFORM net.http_post(
      url     := project_url || '/functions/v1/worker-sync-lastfm',
      headers := jsonb_build_object(
        'Content-Type',       'application/json',
        'System-Cron-Secret', cron_secret
      ),
      body    := jsonb_build_object('worker_id', i, 'dispatched_at', NOW()),
      timeout_milliseconds := 15000
    );
  END LOOP;
END;
$$;

-- ── Push notifications ──

CREATE OR REPLACE FUNCTION public.send_notification_push()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  project_url text;
  trigger_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets WHERE name = 'project_url';

  SELECT decrypted_secret INTO trigger_secret
  FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  -- Skip silently if secrets are not configured (e.g. local without setup).
  IF project_url IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Push secrets not configured, skipping push for notification %', NEW.id;
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/trigger-notification-push-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'System-Trigger-Secret', trigger_secret
    ),
    body := jsonb_build_object(
      'notificationId', NEW.id,
      'userId', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'href', NEW.href,
      'source', NEW.source
    )
  ) INTO request_id;

  RETURN NEW;
END;
$$;

-- ── Discussion media cleanup ──

CREATE OR REPLACE FUNCTION public.trigger_cleanup_discussion_media_on_hard_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  project_url    text;
  trigger_secret text;
  request_id     bigint;
BEGIN
  -- Skip if there is no markdown content to scan.
  IF OLD.markdown IS NULL OR OLD.markdown = '' THEN
    RETURN OLD;
  END IF;

  SELECT decrypted_secret INTO project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO trigger_secret
    FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Discussion media cleanup secrets not configured, skipping for discussion %', OLD.id;
    RETURN OLD;
  END IF;

  SELECT net.http_post(
    url     := project_url || '/functions/v1/trigger-cleanup-discussion-media',
    headers := jsonb_build_object(
      'Content-Type',          'application/json',
      'System-Trigger-Secret', trigger_secret
    ),
    body    := jsonb_build_object(
      'entityId',   OLD.id,
      'entityType', 'discussion',
      'markdown',   OLD.markdown,
      'action',     'HARD_DELETE'
    )
  ) INTO request_id;

  RAISE NOTICE 'Discussion media cleanup (discussion HARD_DELETE) initiated for discussion % (request_id: %)', OLD.id, request_id;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_cleanup_reply_media_on_hard_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  project_url    text;
  trigger_secret text;
  request_id     bigint;
BEGIN
  -- Skip soft-deleted rows: their markdown was already wiped (and the
  -- soft-delete trigger already fired cleanup), so there is nothing to do.
  IF OLD.is_deleted = true THEN
    RETURN OLD;
  END IF;

  -- Skip if there is no markdown content to scan.
  IF OLD.markdown IS NULL OR OLD.markdown = '' THEN
    RETURN OLD;
  END IF;

  SELECT decrypted_secret INTO project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO trigger_secret
    FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Discussion media cleanup secrets not configured, skipping for reply %', OLD.id;
    RETURN OLD;
  END IF;

  SELECT net.http_post(
    url     := project_url || '/functions/v1/trigger-cleanup-discussion-media',
    headers := jsonb_build_object(
      'Content-Type',          'application/json',
      'System-Trigger-Secret', trigger_secret
    ),
    body    := jsonb_build_object(
      'entityId',   OLD.id,
      'entityType', 'reply',
      'markdown',   OLD.markdown,
      'action',     'HARD_DELETE'
    )
  ) INTO request_id;

  RAISE NOTICE 'Discussion media cleanup (reply HARD_DELETE) initiated for reply % (request_id: %)', OLD.id, request_id;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_cleanup_reply_media_on_soft_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  project_url    text;
  trigger_secret text;
  request_id     bigint;
BEGIN
  -- Only act when a reply transitions from not-deleted to deleted.
  IF OLD.is_deleted IS NOT DISTINCT FROM true OR NEW.is_deleted IS NOT DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  -- Skip if there is no markdown content to scan.
  IF OLD.markdown IS NULL OR OLD.markdown = '' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO trigger_secret
    FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Discussion media cleanup secrets not configured, skipping for reply %', OLD.id;
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url     := project_url || '/functions/v1/trigger-cleanup-discussion-media',
    headers := jsonb_build_object(
      'Content-Type',          'application/json',
      'System-Trigger-Secret', trigger_secret
    ),
    body    := jsonb_build_object(
      'entityId',   OLD.id,
      'entityType', 'reply',
      'markdown',   OLD.markdown,
      'action',     'SOFT_DELETE'
    )
  ) INTO request_id;

  RAISE NOTICE 'Discussion media cleanup (reply SOFT_DELETE) initiated for reply % (request_id: %)', OLD.id, request_id;

  RETURN NEW;
END;
$$;

-- ── Discord event sync ──

CREATE OR REPLACE FUNCTION public.trigger_sync_discord_events_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  project_url text;
  trigger_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO trigger_secret FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Discord sync secrets not configured, skipping INSERT sync for event #%s', NEW.id;
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/trigger-discord-event-sync',
    headers := JSONB_BUILD_OBJECT(
      'Content-Type', 'application/json',
      'System-Trigger-Secret', trigger_secret
    ),
    body := JSONB_BUILD_OBJECT('action', 'INSERT', 'eventId', NEW.id, 'timestamp', NOW())
  ) INTO request_id;

  RAISE NOTICE 'Discord INSERT sync initiated for event #% with request_id %', NEW.id, request_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_discord_events_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  project_url text;
  trigger_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO trigger_secret FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Discord sync secrets not configured, skipping UPDATE sync for event #%s', NEW.id;
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/trigger-discord-event-sync',
    headers := JSONB_BUILD_OBJECT(
      'Content-Type', 'application/json',
      'System-Trigger-Secret', trigger_secret
    ),
    body := JSONB_BUILD_OBJECT('action', 'UPDATE', 'eventId', NEW.id, 'timestamp', NOW())
  ) INTO request_id;

  RAISE NOTICE 'Discord UPDATE sync initiated for event #% with request_id %', NEW.id, request_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_discord_events_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  project_url text;
  trigger_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO trigger_secret FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Discord sync secrets not configured, skipping DELETE sync for event #%s', OLD.id;
    RETURN OLD;
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/trigger-discord-event-sync',
    headers := JSONB_BUILD_OBJECT(
      'Content-Type', 'application/json',
      'System-Trigger-Secret', trigger_secret
    ),
    body := JSONB_BUILD_OBJECT(
      'action', 'DELETE',
      'eventId', OLD.id,
      'timestamp', NOW(),
      'discord_event_id', OLD.discord_event_id
    )
  ) INTO request_id;

  RAISE NOTICE 'Discord DELETE sync initiated for event #% with request_id %', OLD.id, request_id;
  RETURN OLD;
END;
$$;

-- ── Google Calendar sync ──

CREATE OR REPLACE FUNCTION public.trigger_sync_google_calendar_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  project_url text;
  trigger_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO trigger_secret FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Google Calendar sync secrets not configured, skipping sync for event #%', NEW.id;
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/trigger-google-calendar-sync',
    headers := JSONB_BUILD_OBJECT(
      'Content-Type', 'application/json',
      'System-Trigger-Secret', trigger_secret
    ),
    body := CONCAT('{"action": "INSERT", "eventId": ', NEW.id, ', "timestamp": "', NOW(), '"}')::jsonb
  ) INTO request_id;

  RAISE NOTICE 'Google Calendar INSERT sync initiated for event #% (request_id: %)', NEW.id, request_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_google_calendar_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  project_url text;
  trigger_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO trigger_secret FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Google Calendar sync secrets not configured, skipping sync for event #%', NEW.id;
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/trigger-google-calendar-sync',
    headers := JSONB_BUILD_OBJECT(
      'Content-Type', 'application/json',
      'System-Trigger-Secret', trigger_secret
    ),
    body := JSONB_BUILD_OBJECT(
      'action', 'UPDATE',
      'eventId', NEW.id,
      'timestamp', NOW(),
      'old_is_official', OLD.is_official,
      'old_google_event_id', OLD.google_event_id,
      'old_google_community_event_id', OLD.google_community_event_id
    )
  ) INTO request_id;

  RAISE NOTICE 'Google Calendar UPDATE sync initiated for event #% (request_id: %)', NEW.id, request_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_google_calendar_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  project_url text;
  trigger_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO trigger_secret FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Google Calendar sync secrets not configured, skipping sync for event #%', OLD.id;
    RETURN OLD;
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/trigger-google-calendar-sync',
    headers := JSONB_BUILD_OBJECT(
      'Content-Type', 'application/json',
      'System-Trigger-Secret', trigger_secret
    ),
    body := JSONB_BUILD_OBJECT(
      'action', 'DELETE',
      'eventId', OLD.id,
      'timestamp', NOW(),
      'google_event_id', OLD.google_event_id,
      'google_community_event_id', OLD.google_community_event_id
    )
  ) INTO request_id;

  RAISE NOTICE 'Google Calendar DELETE sync initiated for event #% (request_id: %)', OLD.id, request_id;
  RETURN OLD;
END;
$$;

-- ── User avatar sync ──

CREATE OR REPLACE FUNCTION public.trigger_user_avatar_sync_from_auth()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  project_url text;
  trigger_secret text;
  request_id bigint;
  avatar_url text;
  email_hash text;
  provider text;
BEGIN
  avatar_url := NULLIF(COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture'), '');
  email_hash := CASE WHEN NEW.email IS NOT NULL
    AND BTRIM(NEW.email) <> '' THEN
    MD5(LOWER(BTRIM(NEW.email)))
  ELSE
    NULL
  END;

  -- Nothing to do if we have neither a social avatar URL nor an email for gravatar
  IF avatar_url IS NULL AND email_hash IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO trigger_secret FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'User avatar sync secrets not configured, skipping for user %', NEW.id;
    RETURN NEW;
  END IF;

  provider := NULLIF(NEW.raw_app_meta_data ->> 'provider', '');

  SELECT net.http_post(
    url := project_url || '/functions/v1/trigger-user-avatar-sync',
    headers := JSONB_BUILD_OBJECT(
      'Content-Type', 'application/json',
      'System-Trigger-Secret', trigger_secret
    ),
    body := JSONB_BUILD_OBJECT(
      'userId', NEW.id,
      'avatarUrl', avatar_url,
      'gravatarEmailHash', email_hash,
      'provider', provider,
      'timestamp', NOW(),
      'op', TG_OP
    )
  ) INTO request_id;

  RAISE NOTICE 'User avatar sync initiated for user % (request_id: %)', NEW.id, request_id;
  RETURN NEW;
END;
$$;
