-- Web Push fan-out trigger for platform notifications
--
-- Every non-chat platform notification (discussion replies, mentions,
-- reply-to-reply, event reschedules, etc.) funnels into public.user_notifications.
-- This AFTER INSERT trigger fires the `push-send` edge function so subscribed
-- devices receive a Web Push message. The edge function is responsible for
-- looking up the recipient's push subscriptions, honouring their opt-in
-- preference, and pruning dead endpoints.
--
-- Mirrors the existing trigger -> edge function pattern (see the Google
-- Calendar sync trigger): authorized via the `system_trigger_secret` vault
-- secret and dispatched asynchronously through pg_net.

BEGIN;

-- Ensure the system trigger secret exists (no-op if already created by an
-- earlier trigger migration).
DO $$
BEGIN
  BEGIN
    PERFORM vault.create_secret('REPLACE-ME', 'system_trigger_secret');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'System trigger secret might already exist: %', SQLERRM;
  END;
END
$$;

CREATE OR REPLACE FUNCTION public.send_notification_push()
  RETURNS TRIGGER
  SECURITY DEFINER
  SET search_path = ''
  LANGUAGE plpgsql
  AS $$
DECLARE
  project_url text;
  anon_key text;
  trigger_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets WHERE name = 'project_url';

  SELECT decrypted_secret INTO anon_key
  FROM vault.decrypted_secrets WHERE name = 'anon_key';

  SELECT decrypted_secret INTO trigger_secret
  FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  -- Skip silently if secrets are not configured (e.g. local without setup).
  IF project_url IS NULL OR anon_key IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Push secrets not configured, skipping push for notification %', NEW.id;
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/push-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'System-Trigger-Secret', trigger_secret
    ),
    body := jsonb_build_object(
      'notificationId', NEW.id,
      'userId', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'href', NEW.href,
      'source', NEW.source
    )
  ) INTO request_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_send_notification_push ON public.user_notifications;

CREATE TRIGGER trigger_send_notification_push
  AFTER INSERT ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.send_notification_push();

-- Trigger functions execute under the table owner regardless of role grants;
-- intentionally not granted to authenticated to keep it internal.
GRANT EXECUTE ON FUNCTION public.send_notification_push() TO service_role;

COMMIT;
