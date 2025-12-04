SELECT
  cron.schedule('daily-metrics-fetch', -- job name
    '0 0 * * *', -- daily at midnight
    $$
    SELECT
      net.http_post(url :=(
          SELECT
            decrypted_secret
          FROM vault.decrypted_secrets
          WHERE
            name = 'project_url') || '/functions/v1/cron-metrics-fetch', headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json', 'Authorization', 'Bearer ' ||(
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

DROP POLICY IF EXISTS "Allow public SELECT metric data in storage" ON storage.objects;

CREATE POLICY "Allow public SELECT metric data in storage" ON storage.objects
	FOR SELECT TO authenticated, anon
		USING (
			bucket_id = 'hivecom-content-static'
			AND name LIKE 'metrics/%'
		);
