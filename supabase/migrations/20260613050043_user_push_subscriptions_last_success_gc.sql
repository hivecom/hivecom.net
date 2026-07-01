-- Push subscription liveness tracking + garbage collection
--
-- Dead subscriptions are pruned reactively when a push attempt returns 410/404
-- (handled by trigger-notification-push-send). This adds a backstop for
-- subscriptions that simply go quiet and never return an error: track the last
-- successful delivery and GC rows that have been silent for a long time.
--
-- `last_success_at` is bumped by the edge function after each successful push.
-- Rows that have never received a push fall back to `created_at` for the GC
-- window, so a freshly created subscription is never collected prematurely.

BEGIN;

ALTER TABLE public.user_push_subscriptions
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz;

COMMENT ON COLUMN public.user_push_subscriptions.last_success_at
  IS 'Timestamp of the last successful push delivery. NULL until the first successful push. Used by the GC cron to retire long-silent subscriptions.';

-- Daily GC: drop subscriptions silent for more than 6 months. COALESCE keeps
-- never-pushed-but-recent rows alive (fall back to created_at).
SELECT cron.schedule(
  'cron-push-subscriptions-gc',
  '0 4 * * *',
  $$DELETE FROM public.user_push_subscriptions WHERE COALESCE(last_success_at, created_at) < now() - interval '6 months'$$
);

COMMIT;
