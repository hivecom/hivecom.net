-- Update DELETE function to pass google_community_event_id alongside google_event_id
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
  SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO anon_key FROM vault.decrypted_secrets WHERE name = 'anon_key';
  SELECT decrypted_secret INTO trigger_secret FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR anon_key IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Google Calendar sync secrets not configured, skipping sync for event #%', OLD.id;
    RETURN OLD;
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/trigger-google-calendar-sync',
    headers := JSONB_BUILD_OBJECT(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'System-Trigger-Secret', trigger_secret
    ),
    body := JSONB_BUILD_OBJECT(
      'action', 'DELETE',
      'eventId', OLD.id,
      'timestamp', NOW(),
      'google_event_id', OLD.google_event_id,
      'google_community_event_id', OLD.google_community_event_id
    )
  ) INTO request_id;

  RAISE NOTICE 'Google Calendar DELETE sync initiated for event #% (request_id: %)', OLD.id, request_id;
  RETURN OLD;
END;
$$;

-- Rebuild UPDATE trigger to also watch is_official so cross-calendar moves are detected
DROP TRIGGER IF EXISTS trigger_sync_google_calendar_update ON public.events;

CREATE TRIGGER trigger_sync_google_calendar_update
  AFTER UPDATE OF title, description, date, duration_minutes, location, note, link, is_official
  ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION sync_google_calendar_update();

-- Rebuild DELETE trigger to fire when either calendar ID is set
DROP TRIGGER IF EXISTS trigger_sync_google_calendar_delete ON public.events;

CREATE TRIGGER trigger_sync_google_calendar_delete
  AFTER DELETE ON public.events
  FOR EACH ROW
  WHEN (OLD.google_event_id IS NOT NULL OR OLD.google_community_event_id IS NOT NULL)
  EXECUTE FUNCTION sync_google_calendar_delete();

GRANT EXECUTE ON FUNCTION sync_google_calendar_delete() TO service_role;
