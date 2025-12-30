-- This migration creates database triggers for automatic Google Calendar sync
-- First, create a vault secret for the system trigger secret
DO $$
DECLARE
  token_value text;
BEGIN
  BEGIN
    PERFORM
      vault.create_secret('REPLACE-ME', 'system_trigger_secret');
  EXCEPTION
    WHEN OTHERS THEN
      -- Secret might already exist, we can ignore this
      RAISE NOTICE 'System trigger secret might already exist: %', SQLERRM;
  END;
END
$$;

-- Create a function to sync events with Google Calendar after INSERT
CREATE OR REPLACE FUNCTION sync_google_calendar_insert()
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
    RAISE NOTICE 'Google Calendar sync secrets not configured, skipping sync for event #%', NEW.id;
    RETURN NEW;
  END IF;
  -- Send async request to trigger Google Calendar sync
  SELECT
    net.http_post(url := project_url || '/functions/v1/trigger-google-calendar-sync', headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon_key, 'System-Trigger-Secret', trigger_secret), body := CONCAT('{"action": "INSERT", "eventId": ', NEW.id, ', "timestamp": "', NOW(), '"}')::jsonb) INTO request_id;
  RAISE NOTICE 'Google Calendar INSERT sync initiated for event #% (request_id: %)', NEW.id, request_id;
  RETURN NEW;
END;
$$;

-- Create a function to sync events with Google Calendar after UPDATE
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
    RAISE NOTICE 'Google Calendar sync secrets not configured, skipping sync for event #%', NEW.id;
    RETURN NEW;
  END IF;
  -- Send async request to trigger Google Calendar sync
  SELECT
    net.http_post(url := project_url || '/functions/v1/trigger-google-calendar-sync', headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon_key, 'System-Trigger-Secret', trigger_secret), body := CONCAT('{"action": "UPDATE", "eventId": ', NEW.id, ', "timestamp": "', NOW(), '"}')::jsonb) INTO request_id;
  RAISE NOTICE 'Google Calendar UPDATE sync initiated for event #% (request_id: %)', NEW.id, request_id;
  RETURN NEW;
END;
$$;

-- Create a function to sync events with Google Calendar after DELETE
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
  -- Send async request to trigger Google Calendar sync
  SELECT
    net.http_post(url := project_url || '/functions/v1/trigger-google-calendar-sync', headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon_key, 'System-Trigger-Secret', trigger_secret), body := CONCAT('{"action": "DELETE", "eventId": ', OLD.id, ', "timestamp": "', NOW(), '"}')::jsonb) INTO request_id;
  RAISE NOTICE 'Google Calendar DELETE sync initiated for event #% (request_id: %)', OLD.id, request_id;
  RETURN OLD;
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_sync_google_calendar_insert ON public.events;

DROP TRIGGER IF EXISTS trigger_sync_google_calendar_update ON public.events;

DROP TRIGGER IF EXISTS trigger_sync_google_calendar_delete ON public.events;

-- Create triggers for INSERT, UPDATE, and DELETE operations
CREATE TRIGGER trigger_sync_google_calendar_insert
  AFTER INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION sync_google_calendar_insert();

CREATE TRIGGER trigger_sync_google_calendar_update
  AFTER UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION sync_google_calendar_update();

CREATE TRIGGER trigger_sync_google_calendar_delete
  AFTER DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION sync_google_calendar_delete();

-- Grant necessary permissions for the trigger functions
GRANT EXECUTE ON FUNCTION sync_google_calendar_insert() TO authenticated;

GRANT EXECUTE ON FUNCTION sync_google_calendar_insert() TO service_role;

GRANT EXECUTE ON FUNCTION sync_google_calendar_update() TO authenticated;

GRANT EXECUTE ON FUNCTION sync_google_calendar_update() TO service_role;

GRANT EXECUTE ON FUNCTION sync_google_calendar_delete() TO authenticated;

GRANT EXECUTE ON FUNCTION sync_google_calendar_delete() TO service_role;

