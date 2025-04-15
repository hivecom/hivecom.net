
-- Make sure the cron extension is installed
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";

-- Make sure teh pg_net extension is installed
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

-- Create a Vault secret for the project URL so that we can use it in the cron job for invoking our edge functions.
-- Replace with 'https://project_ref.supabase.co' when deploying to production.
SELECT vault.create_secret('http://127.0.0.1:54321', 'project_url');

-- Setup hourly cron job for Docker control container fetch
-- Create a random secure token for system cron invocation
DO $$
DECLARE
  token_value TEXT;
BEGIN
  -- Generate a secure random token
  token_value := encode(gen_random_bytes(32), 'hex');

  -- Store the token in the vault (this will fail if it already exists)
  BEGIN
    PERFORM vault.create_secret(token_value, 'system_cron_secret');
    EXCEPTION WHEN OTHERS THEN
    -- Secret might already exist, we can ignore this
    RAISE NOTICE 'Secret might already exist: %', SQLERRM;
  END;
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
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'system_cron_secret')
      ),
      body:=concat('{"time": "', now(), '"}')::jsonb
    ) AS request_id;
  $$
);
