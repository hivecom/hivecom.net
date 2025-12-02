-- Migration: Add Discord scheduled event sync hooks for events table

-- Ensure the events table tracks Discord sync metadata
ALTER TABLE events
	ADD COLUMN IF NOT EXISTS discord_event_id text,
	ADD COLUMN IF NOT EXISTS discord_last_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_events_discord_event_id ON events(discord_event_id)
WHERE
	discord_event_id IS NOT NULL;

COMMENT ON COLUMN events.discord_event_id IS 'Discord scheduled event ID used for syncing with the Discord API';
COMMENT ON COLUMN events.discord_last_synced_at IS 'Timestamp of the last successful Discord sync for this event';

-- Helper function: send INSERT sync request to Discord edge function
CREATE OR REPLACE FUNCTION sync_discord_events_insert()
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
		RAISE NOTICE 'Discord sync secrets not configured, skipping INSERT sync for event #%s', NEW.id;
		RETURN NEW;
	END IF;

	SELECT net.http_post(
		url := project_url || '/functions/v1/trigger-discord-event-sync',
		headers := JSONB_BUILD_OBJECT(
			'Content-Type', 'application/json',
			'Authorization', 'Bearer ' || anon_key,
			'System-Trigger-Secret', trigger_secret
		),
		body := JSONB_BUILD_OBJECT('action', 'INSERT', 'eventId', NEW.id, 'timestamp', NOW())
	) INTO request_id;

	RAISE NOTICE 'Discord INSERT sync initiated for event #% with request_id %', NEW.id, request_id;
	RETURN NEW;
END;
$$;

-- Helper function: send UPDATE sync request to Discord edge function
CREATE OR REPLACE FUNCTION sync_discord_events_update()
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
		RAISE NOTICE 'Discord sync secrets not configured, skipping UPDATE sync for event #%s', NEW.id;
		RETURN NEW;
	END IF;

	SELECT net.http_post(
		url := project_url || '/functions/v1/trigger-discord-event-sync',
		headers := JSONB_BUILD_OBJECT(
			'Content-Type', 'application/json',
			'Authorization', 'Bearer ' || anon_key,
			'System-Trigger-Secret', trigger_secret
		),
		body := JSONB_BUILD_OBJECT('action', 'UPDATE', 'eventId', NEW.id, 'timestamp', NOW())
	) INTO request_id;

	RAISE NOTICE 'Discord UPDATE sync initiated for event #% with request_id %', NEW.id, request_id;
	RETURN NEW;
END;
$$;

-- Helper function: send DELETE sync request to Discord edge function
CREATE OR REPLACE FUNCTION sync_discord_events_delete()
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
		RAISE NOTICE 'Discord sync secrets not configured, skipping DELETE sync for event #%s', OLD.id;
		RETURN OLD;
	END IF;

	SELECT net.http_post(
		url := project_url || '/functions/v1/trigger-discord-event-sync',
		headers := JSONB_BUILD_OBJECT(
			'Content-Type', 'application/json',
			'Authorization', 'Bearer ' || anon_key,
			'System-Trigger-Secret', trigger_secret
		),
		body := JSONB_BUILD_OBJECT(
			'action', 'DELETE',
			'eventId', OLD.id,
			'timestamp', NOW(),
			'discord_event_id', OLD.discord_event_id
		)
	) INTO request_id;

	RAISE NOTICE 'Discord DELETE sync initiated for event #% with request_id %', OLD.id, request_id;
	RETURN OLD;
END;
$$;

-- Drop and recreate triggers targeting the Discord sync functions
DROP TRIGGER IF EXISTS trigger_sync_discord_events_insert ON public.events;
DROP TRIGGER IF EXISTS trigger_sync_discord_events_update ON public.events;
DROP TRIGGER IF EXISTS trigger_sync_discord_events_delete ON public.events;

CREATE TRIGGER trigger_sync_discord_events_insert
	AFTER INSERT ON public.events
	FOR EACH ROW
	EXECUTE FUNCTION sync_discord_events_insert();

CREATE TRIGGER trigger_sync_discord_events_update
	AFTER UPDATE OF title,
	description,
	date,
	duration_minutes,
	location,
	note,
	link ON public.events
	FOR EACH ROW
	EXECUTE FUNCTION sync_discord_events_update();

CREATE TRIGGER trigger_sync_discord_events_delete
	AFTER DELETE ON public.events
	FOR EACH ROW
	WHEN (OLD.discord_event_id IS NOT NULL)
	EXECUTE FUNCTION sync_discord_events_delete();

GRANT EXECUTE ON FUNCTION sync_discord_events_insert() TO service_role;
GRANT EXECUTE ON FUNCTION sync_discord_events_update() TO service_role;
GRANT EXECUTE ON FUNCTION sync_discord_events_delete() TO service_role;
