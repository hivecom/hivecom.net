-- Rename the push edge function: push-send -> trigger-notification-push-send
--
-- The edge function was renamed to match the `trigger-*` naming convention used
-- by the other trigger-driven functions. The trigger function created in
-- 20260612211004_user_notifications_push_trigger.sql hardcodes the old
-- `/functions/v1/push-send` URL, so replace it in place to point at the new
-- function path. Nothing else about the trigger changes.

BEGIN;

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
    url := project_url || '/functions/v1/trigger-notification-push-send',
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

-- Refresh the table comment to reference the new function name.
COMMENT ON TABLE public.user_push_subscriptions
  IS 'Web Push subscriptions. One row per browser/device, used by trigger-notification-push-send to deliver platform notifications.';

COMMIT;
