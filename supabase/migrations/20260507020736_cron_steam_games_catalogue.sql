-- Schedule daily cron job to populate the steam_games catalogue
SELECT cron.schedule('daily-steam-games-catalogue', '0 2 * * *', $$
  SELECT
    net.http_post(
      url := (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'
      ) || '/functions/v1/cron-steam-games-catalogue',
      headers := jsonb_build_object(
        'Content-Type',       'application/json',
        'Authorization',      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
        'System-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'system_cron_secret')
      ),
      body := CONCAT('{"time": "', NOW(), '"}')::jsonb
    ) AS request_id;
$$);
