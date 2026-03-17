BEGIN;

-- Update the steam enqueue function to respect the rich_presence_enabled opt-in flag.
-- Previously it enqueued all profiles with a steam_id; now it only enqueues profiles
-- that have explicitly opted into rich presence.
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
  -- Only enqueue profiles that have Steam linked AND have opted into rich presence.
  FOR profile_record IN
  SELECT
    id,
    steam_id
  FROM
    public.profiles
  WHERE
    steam_id IS NOT NULL
    AND rich_presence_enabled = TRUE LOOP
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

COMMENT ON FUNCTION private.queue_enqueue_worker_sync_steam() IS 'Enqueues profiles with steam_id and rich_presence_enabled into the queue_sync_steam queue for background processing';

COMMIT;
