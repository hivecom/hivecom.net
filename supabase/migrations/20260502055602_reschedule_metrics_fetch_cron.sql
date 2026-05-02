-- Unschedule the old daily cron job
SELECT cron.unschedule('daily-metrics-fetch');

-- Schedule cron job to invoke cron-metrics-fetch every 30 minutes
SELECT cron.schedule('halfhourly-metrics-fetch', '*/30 * * * *', $$
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
$$);
