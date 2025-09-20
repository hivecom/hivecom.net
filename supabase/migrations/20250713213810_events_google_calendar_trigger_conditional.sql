DROP TRIGGER IF EXISTS trigger_sync_google_calendar_delete ON public.events;

-- Create or replace the improved DELETE sync function for Google Calendar
CREATE OR REPLACE FUNCTION sync_google_calendar_delete()
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
  -- Get necessary secrets from vault
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
    decrypted_secret INTO trigger_secret
  FROM
    vault.decrypted_secrets
  WHERE
    name = 'system_trigger_secret';
  -- Skip sync if secrets are not configured
  IF project_url IS NULL OR anon_key IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Google Calendar sync secrets not configured, skipping sync for event #%', OLD.id;
    RETURN OLD;
  END IF;
  -- Send async request to trigger Google Calendar sync, passing all OLD event fields
  SELECT
    net.http_post(url := project_url || '/functions/v1/trigger-google-calendar-sync', headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon_key, 'System-Trigger-Secret', trigger_secret), body := JSONB_BUILD_OBJECT('action', 'DELETE', 'eventId', OLD.id, 'timestamp', NOW(), 'google_event_id', OLD.google_event_id)) INTO request_id;
  RAISE NOTICE 'Google Calendar DELETE sync initiated for event #% (request_id: %)', OLD.id, request_id;
  RETURN OLD;
END;
$$;

-- Conditional triggers for Google Calendar sync to prevent infinite loop
DROP TRIGGER IF EXISTS trigger_sync_google_calendar_update ON public.events;

CREATE TRIGGER trigger_sync_google_calendar_update
  AFTER UPDATE OF title,
  description,
  date,
  duration_minutes,
  location,
  note,
  link ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION sync_google_calendar_update();

-- Create DELETE trigger: only run if google_event_id is not null
CREATE TRIGGER trigger_sync_google_calendar_delete
  AFTER DELETE ON public.events
  FOR EACH ROW
  WHEN(OLD.google_event_id IS NOT NULL)
  EXECUTE FUNCTION sync_google_calendar_delete();

GRANT EXECUTE ON FUNCTION sync_google_calendar_update() TO service_role;

GRANT EXECUTE ON FUNCTION sync_google_calendar_delete() TO service_role;

REVOKE EXECUTE ON FUNCTION sync_google_calendar_insert() FROM authenticated;

