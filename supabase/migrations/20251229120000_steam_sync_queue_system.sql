-- Steam Sync Queue System
-- Architecture: pg_cron (Scheduler) → queue_sync_steam (Queue) → steam-worker (Edge Function)
-- Configuration is controlled dynamically via private.kvstore
-- 1. PRIVATE KVSTORE
-- Create private.kvstore table (mirroring public.kvstore structure)
CREATE TABLE IF NOT EXISTS private.kvstore(
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  type public.kvstore_type NOT NULL DEFAULT 'JSON',
  created_at timestamptz DEFAULT NOW(),
  modified_at timestamptz,
  created_by uuid, -- Nullable for system use
  modified_by uuid
);

COMMENT ON TABLE private.kvstore IS 'Private key/value store for internal system configuration (hidden from API)';

COMMENT ON COLUMN private.kvstore.key IS 'Unique key for the stored value';

COMMENT ON COLUMN private.kvstore.type IS 'Declared type of the value';

COMMENT ON COLUMN private.kvstore.value IS 'Stored value in JSONB format';

-- Revoke access from API roles (hide from PostgREST)
REVOKE USAGE ON SCHEMA private FROM anon, authenticated;

-- Seed the Steam worker configuration
INSERT INTO private.kvstore(key, value, type)
  VALUES ('worker_sync_steam', '{
    "max_wall_clock_ms": 140000,
    "batch_size": 50,
    "visibility_timeout_sec": 60,
    "max_concurrency": 20
  }'::jsonb, 'JSON')
ON CONFLICT (key)
  DO UPDATE SET
    value = EXCLUDED.value,
    modified_at = NOW();

-- 2. PGMQ QUEUE SETUP
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create the Steam sync queue
SELECT
FROM
  pgmq.create('queue_sync_steam');

-- 3. PRODUCER: Enqueue Steam Jobs (daily at 8 PM CET)
-- Function to enqueue all profiles with steam_id into the queue
CREATE OR REPLACE FUNCTION private.queue_enqueue_worker_sync_steam()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pgmq
  AS $$
DECLARE
  profile_record RECORD;
  messages jsonb[] := '{}';
  batch_count int := 0;
BEGIN
  -- Collect profiles with steam_id into batches
  FOR profile_record IN
  SELECT
    id,
    steam_id
  FROM
    public.profiles
  WHERE
    steam_id IS NOT NULL LOOP
      messages := messages || JSONB_BUILD_OBJECT('profile_id', profile_record.id, 'steam_id', profile_record.steam_id);
      batch_count := batch_count + 1;
      -- Send in batches of 100 to avoid memory issues
      IF batch_count >= 100 THEN
        PERFORM
          pgmq.send_batch('queue_sync_steam', messages);
        messages := '{}';
        batch_count := 0;
      END IF;
    END LOOP;
  -- Send any remaining messages
  IF batch_count > 0 THEN
    PERFORM
      pgmq.send_batch('queue_sync_steam', messages);
  END IF;
END;
$$;

COMMENT ON FUNCTION private.queue_enqueue_worker_sync_steam() IS 'Enqueues all profiles with steam_id into the queue_sync_steam queue for background processing';

-- Schedule the producer job (every 15 minutes)
SELECT
  cron.schedule('queue_enqueue_sync_steam', '*/15 * * * *', $$
    SELECT
      private.queue_enqueue_worker_sync_steam();

$$);

-- 4. DISPATCHER: Fire Steam Workers (every 1 minute)
-- Function to dispatch steam workers based on queue depth
CREATE OR REPLACE FUNCTION private.queue_dispatch_worker_sync_steam()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, private, pgmq, net, vault
  AS $$
DECLARE
  config jsonb;
  queue_depth bigint;
  batch_size int;
  max_concurrency int;
  workers_needed int;
  workers_to_fire int;
  project_url text;
  anon_key text;
  cron_secret text;
  i int;
BEGIN
  -- Step 1: Fetch config from private.kvstore
  SELECT
    value INTO config
  FROM
    private.kvstore
  WHERE
    key = 'worker_sync_steam';
  -- Use defaults if config not found
  IF config IS NULL THEN
    config := '{"batch_size": 10, "max_concurrency": 5}'::jsonb;
  END IF;
  batch_size := COALESCE((config ->> 'batch_size')::int, 10);
  max_concurrency := COALESCE((config ->> 'max_concurrency')::int, 5);
  -- Step 2: Check queue depth
  SELECT
    queue_length INTO queue_depth
  FROM
    pgmq.metrics('queue_sync_steam');
  -- If queue is empty, no need to dispatch workers
  IF queue_depth IS NULL OR queue_depth = 0 THEN
    RETURN;
  END IF;
  -- Step 3: Calculate workers needed
  workers_needed := CEIL(queue_depth::numeric / batch_size);
  workers_to_fire := LEAST(workers_needed, max_concurrency);
  -- Step 4: Get vault secrets
  SELECT
    decrypted_secret INTO project_url
  FROM
    vault.decrypted_secrets
  WHERE
    name = 'project_url';
  SELECT
    decrypted_secret INTO anon_key
  FROM
    vault.decrypted_secrets
  WHERE
    name = 'anon_key';
  SELECT
    decrypted_secret INTO cron_secret
  FROM
    vault.decrypted_secrets
  WHERE
    name = 'system_cron_secret';
  IF project_url IS NULL OR anon_key IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'Missing vault secrets for steam worker dispatch';
    RETURN;
  END IF;
  -- Step 5: Fire workers
  FOR i IN 1..workers_to_fire LOOP
    PERFORM
      net.http_post(url := project_url || '/functions/v1/worker-sync-steam', headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon_key, 'System-Cron-Secret', cron_secret), body := JSONB_BUILD_OBJECT('worker_id', i, 'dispatched_at', NOW()));
  END LOOP;
END;
$$;

COMMENT ON FUNCTION private.queue_dispatch_worker_sync_steam() IS 'Dispatches steam-worker Edge Functions based on queue depth and configuration';

-- Schedule the dispatcher job (every 1 minute)
SELECT
  cron.schedule('queue_dispatch_sync_steam', '* * * * *', $$
    SELECT
      private.queue_dispatch_worker_sync_steam();

$$);

-- =============================================================================
-- 5. HELPER FUNCTION: Get Private KVStore value (for Edge Functions)
-- =============================================================================
-- This function allows Edge Functions to read from private.kvstore using service role
CREATE OR REPLACE FUNCTION public.get_private_config(config_key text)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = private
  AS $$
  SELECT
    value
  FROM
    private.kvstore
  WHERE
    key = config_key;
$$;

COMMENT ON FUNCTION public.get_private_config(text) IS 'Retrieves configuration from private.kvstore (requires service role)';

-- Revoke public access, only service role can call this
REVOKE ALL ON FUNCTION public.get_private_config(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_private_config(text) FROM anon;

REVOKE ALL ON FUNCTION public.get_private_config(text) FROM authenticated;

-- =============================================================================
-- 6. HELPER FUNCTION: Send message to PGMQ queue (for Edge Functions)
-- =============================================================================
-- This function allows Edge Functions to send messages to pgmq queues using service role
CREATE OR REPLACE FUNCTION public.pgmq_send(queue_name text, msg jsonb)
  RETURNS bigint
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = pgmq
  AS $$
  SELECT
    pgmq.send(queue_name, msg);
$$;

COMMENT ON FUNCTION public.pgmq_send(text, jsonb) IS 'Sends a message to a PGMQ queue (requires service role)';

-- Revoke public access, only service role can call this
REVOKE ALL ON FUNCTION public.pgmq_send(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.pgmq_send(text, jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.pgmq_send(text, jsonb) FROM authenticated;

-- =============================================================================
-- 7. HELPER FUNCTION: Read messages from PGMQ queue (for Edge Functions)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.pgmq_read(queue_name text, vt integer, qty integer)
  RETURNS SETOF pgmq.message_record
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = pgmq
  AS $$
  SELECT
    *
  FROM
    pgmq.read(queue_name, vt, qty);
$$;

COMMENT ON FUNCTION public.pgmq_read(text, integer, integer) IS 'Reads messages from a PGMQ queue with visibility timeout (requires service role)';

REVOKE ALL ON FUNCTION public.pgmq_read(text, integer, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.pgmq_read(text, integer, integer) FROM anon;

REVOKE ALL ON FUNCTION public.pgmq_read(text, integer, integer) FROM authenticated;

-- =============================================================================
-- 8. HELPER FUNCTION: Delete message from PGMQ queue (for Edge Functions)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.pgmq_delete(queue_name text, msg_id bigint)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = pgmq
  AS $$
  SELECT
    pgmq.delete(queue_name, msg_id);
$$;

COMMENT ON FUNCTION public.pgmq_delete(text, bigint) IS 'Deletes a message from a PGMQ queue (requires service role)';

REVOKE ALL ON FUNCTION public.pgmq_delete(text, bigint) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.pgmq_delete(text, bigint) FROM anon;

REVOKE ALL ON FUNCTION public.pgmq_delete(text, bigint) FROM authenticated;

