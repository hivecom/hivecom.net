-- Rename cron jobs and DB functions to a consistent `cron-` / `cron_` prefix.
--
-- Before:
--   daily-patreon-fetch                  -> cron-patreon-fetch
--   fiveminute-metrics-fetch             -> cron-metrics-fetch
--   hourly-docker-control-container-fetch -> cron-docker-control-container-fetch
--   quarterhourly-teamspeak-sync         -> cron-teamspeak-sync
--   metrics-daily-rollup                 -> cron-metrics-daily-rollup
--   metrics_daily_rollup()               -> cron_metrics_daily_rollup()
--
-- queue_dispatch_sync_steam and queue_enqueue_sync_steam are left untouched
-- (queue subsystem, different naming convention).

-- -----------------------------------------------------------------------
-- 1. Rename DB function metrics_daily_rollup -> cron_metrics_daily_rollup
-- -----------------------------------------------------------------------

ALTER FUNCTION public.metrics_daily_rollup() RENAME TO cron_metrics_daily_rollup;

-- -----------------------------------------------------------------------
-- 2. Rename cron jobs
-- -----------------------------------------------------------------------

SELECT cron.unschedule('daily-patreon-fetch');
SELECT cron.schedule(
  'cron-patreon-fetch',
  '0 0 * * *',
  $$
    SELECT
      net.http_post(url :=(
          SELECT
            decrypted_secret
          FROM vault.decrypted_secrets
          WHERE
            name = 'project_url') || '/functions/v1/cron-patreon-fetch', headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json', 'Authorization', 'Bearer ' ||(
            SELECT
              decrypted_secret
            FROM vault.decrypted_secrets
            WHERE
              name = 'anon_key'), 'System-Cron-Secret',(
            SELECT
              decrypted_secret
            FROM vault.decrypted_secrets
          WHERE
            name = 'system_cron_secret')), body := CONCAT('{"time": "', NOW(), '"}')::jsonb) AS request_id;
  $$
);

SELECT cron.unschedule('fiveminute-metrics-fetch');
SELECT cron.schedule(
  'cron-metrics-fetch',
  '*/5 * * * *',
  $$
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
        body := CONCAT('{"time": "', NOW(), '"}')::jsonb
      ) AS request_id;
  $$
);

SELECT cron.unschedule('hourly-docker-control-container-fetch');
SELECT cron.schedule(
  'cron-docker-control-container-fetch',
  '30 * * * *',
  $$
    SELECT
      net.http_post(url :=(
          SELECT
            decrypted_secret
          FROM vault.decrypted_secrets
          WHERE
            name = 'project_url') || '/functions/v1/cron-docker-control-container-fetch', headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json', 'Authorization', 'Bearer ' ||(
            SELECT
              decrypted_secret
            FROM vault.decrypted_secrets
            WHERE
              name = 'anon_key'), 'System-Cron-Secret',(
            SELECT
              decrypted_secret
            FROM vault.decrypted_secrets
          WHERE
            name = 'system_cron_secret')), body := CONCAT('{"time": "', NOW(), '"}')::jsonb) AS request_id;
  $$
);

SELECT cron.unschedule('quarterhourly-teamspeak-sync');
SELECT cron.schedule(
  'cron-teamspeak-sync',
  '*/15 * * * *',
  $$
    SELECT
      net.http_post(url :=(
          SELECT
            decrypted_secret
          FROM vault.decrypted_secrets
          WHERE
            name = 'project_url') || '/functions/v1/cron-teamspeak-sync', headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json', 'Authorization', 'Bearer ' ||(
            SELECT
              decrypted_secret
            FROM vault.decrypted_secrets
            WHERE
              name = 'anon_key'), 'System-Cron-Secret',(
            SELECT
              decrypted_secret
            FROM vault.decrypted_secrets
          WHERE
            name = 'system_cron_secret')), body := JSONB_BUILD_OBJECT('time', NOW())) AS request_id;
  $$
);

SELECT cron.unschedule('metrics-daily-rollup');
SELECT cron.schedule(
  'cron-metrics-rollup',
  '0 4 * * *',
  $$SELECT public.cron_metrics_daily_rollup()$$
);
