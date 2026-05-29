-- Schedule cron job to invoke cron-render-status-banner every 5 minutes
SELECT cron.schedule(
  'cron-render-status-banner',
  '*/5 * * * *',
  $$
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
        body := CONCAT('{"time": "', NOW(), '"}')::jsonb
      ) AS request_id;
  $$
);
