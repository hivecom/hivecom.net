-- Create or replace the hourly cron job
SELECT
  cron.schedule('daily-patreon-fetch', -- job name
    '0 0 * * *', -- daily at midnight
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

$$);

--  Remove the old docker-control-container-fetch-hourly job if it exists
SELECT
  cron.unschedule('docker-control-container-fetch-hourly');

SELECT
  cron.schedule('hourly-docker-control-container-fetch', -- job name
    '30 * * * *', -- hourly at minute 30
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

$$);

ALTER TABLE "public"."monthly_funding"
  ADD COLUMN "donation_count" integer NOT NULL DEFAULT 0;

