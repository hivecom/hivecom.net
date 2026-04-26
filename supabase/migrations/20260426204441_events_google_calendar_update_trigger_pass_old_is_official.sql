CREATE OR REPLACE FUNCTION sync_google_calendar_update()
  RETURNS TRIGGER
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
  AS $$
DECLARE
  project_url text;
  anon_key text;
  trigger_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO anon_key FROM vault.decrypted_secrets WHERE name = 'anon_key';
  SELECT decrypted_secret INTO trigger_secret FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR anon_key IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Google Calendar sync secrets not configured, skipping sync for event #%', NEW.id;
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/trigger-google-calendar-sync',
    headers := JSONB_BUILD_OBJECT(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'System-Trigger-Secret', trigger_secret
    ),
    body := JSONB_BUILD_OBJECT(
      'action', 'UPDATE',
      'eventId', NEW.id,
      'timestamp', NOW(),
      'old_is_official', OLD.is_official,
      'old_google_event_id', OLD.google_event_id,
      'old_google_community_event_id', OLD.google_community_event_id
    )
  ) INTO request_id;

  RAISE NOTICE 'Google Calendar UPDATE sync initiated for event #% (request_id: %)', NEW.id, request_id;
  RETURN NEW;
END;
$$;
