-- This migration creates a new secret in the vault for the Supabase anon key consumed by our cron job for correct authorization.
DO $$
DECLARE
BEGIN
  PERFORM vault.create_secret('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbXFvY211eW9scGpqYm5iY2hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTUwMTkxNDQsImV4cCI6MjAzMDU5NTE0NH0.QmtBbAOfQ4usos4zQHih6nqesf5HQBYD1e7ujpsanqI', 'anon_key');
  EXCEPTION WHEN OTHERS THEN
  -- Secret might already exist, we can ignore this
  RAISE NOTICE 'Secret might already exist: %', SQLERRM;
END
$$;

-- Create or replace the hourly cron job
SELECT cron.schedule(
  'docker-control-container-fetch-hourly', -- job name
  '0 * * * *', -- cron schedule (hourly at minute 0)
  $$
  SELECT
    net.http_post(
      url:= (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/cron-docker-control-container-fetch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
        'System-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'system_cron_secret')
      ),
      body:=concat('{"time": "', now(), '"}')::jsonb
    ) AS request_id;
  $$
);
