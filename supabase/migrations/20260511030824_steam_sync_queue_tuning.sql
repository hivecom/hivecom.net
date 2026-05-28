-- Tune Steam sync queue system:
-- 1. Change enqueue cron from every 15 minutes to every 5 minutes
-- 2. Increase batch_size from 50 to 100 to match GetPlayerSummaries API limit (1 call per batch)

-- Reschedule enqueue job from */15 to */5
SELECT cron.unschedule('queue_enqueue_sync_steam');

SELECT
  cron.schedule('queue_enqueue_sync_steam', '*/5 * * * *', $$
    SELECT private.queue_enqueue_worker_sync_steam();
  $$);

-- Update batch_size in private kvstore to 100
UPDATE private.kvstore
SET
  value = value || '{"batch_size": 100}'::jsonb,
  modified_at = NOW()
WHERE
  key = 'worker_sync_steam';
