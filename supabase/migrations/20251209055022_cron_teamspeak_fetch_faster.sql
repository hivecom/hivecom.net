-- Unschedule the old 30-minute cron job
SELECT
  cron.unschedule('bihourly-teamspeak-sync');

-- Schedule cron job to invoke cron-teamspeak-sync every 15 minutes
SELECT
  cron.schedule('quarterhourly-teamspeak-sync', '*/15 * * * *', $$
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

$$);

