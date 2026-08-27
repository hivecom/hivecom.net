-- Pass an explicit timeout on all pg_net edge function invocations. The
-- default is 5000ms and cron-metrics-fetch, cron-docker-control-container-fetch
-- and the sync workers routinely run 5-8s, which shows up as timeout failures
-- in net._http_response even though the functions complete fine. 15s keeps the
-- failure log meaningful: a timeout now means an actual hang, not a slow run.

-- cron.schedule with an existing jobname updates the job in place.

SELECT cron.schedule('cron-metrics-fetch', '*/5 * * * *', $$
  SELECT
    net.http_post(
      url := (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'
      ) || '/functions/v1/cron-metrics-fetch',
      headers := jsonb_build_object(
        'Content-Type',       'application/json',
        'Authorization',      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
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
        'Authorization',      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
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
        'Authorization',      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
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
        'Authorization',      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
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
        'Authorization',      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
        'System-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'system_cron_secret')
      ),
      body := CONCAT('{"time": "', NOW(), '"}')::jsonb,
      timeout_milliseconds := 15000
    ) AS request_id;
$$);

-- Queue dispatch functions fire the sync workers the same way, add the
-- timeout there too. Bodies otherwise unchanged.

CREATE OR REPLACE FUNCTION private.queue_dispatch_worker_sync_lastfm()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pgmq', 'net', 'vault'
AS $function$
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
      body    := jsonb_build_object('worker_id', i, 'dispatched_at', NOW()),
      timeout_milliseconds := 15000
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION private.queue_dispatch_worker_sync_steam()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pgmq', 'net', 'vault'
AS $function$
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

  SELECT decrypted_secret INTO anon_key
  FROM vault.decrypted_secrets WHERE name = 'anon_key';

  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets WHERE name = 'system_cron_secret';

  IF project_url IS NULL OR anon_key IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'Missing vault secrets for steam worker dispatch';
    RETURN;
  END IF;

  FOR i IN 1..workers_to_fire LOOP
    PERFORM net.http_post(
      url     := project_url || '/functions/v1/worker-sync-steam',
      headers := jsonb_build_object(
        'Content-Type',       'application/json',
        'Authorization',      'Bearer ' || anon_key,
        'System-Cron-Secret', cron_secret
      ),
      body    := jsonb_build_object('worker_id', i, 'dispatched_at', NOW()),
      timeout_milliseconds := 15000
    );
  END LOOP;
END;
$function$;
