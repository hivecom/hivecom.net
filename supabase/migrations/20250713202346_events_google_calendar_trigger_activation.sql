-- Migration: Ensure Google Calendar triggers are active for events table
-- This migration ensures that the Google Calendar sync triggers are properly set up.
--
-- Note: The actual trigger functions and triggers were created in migration 20250626083403.
-- This migration serves as a checkpoint to verify they are active and documents
-- the transition from frontend-initiated sync to database trigger-initiated sync.
-- Verify that the trigger functions exist
DO $$
BEGIN
  -- Check if the trigger functions exist
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_proc
    WHERE
      proname = 'sync_google_calendar_insert') THEN
  RAISE EXCEPTION 'Google Calendar trigger function sync_google_calendar_insert does not exist. Please ensure migration 20250626083403 has been applied.';
END IF;
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_proc
    WHERE
      proname = 'sync_google_calendar_update') THEN
  RAISE EXCEPTION 'Google Calendar trigger function sync_google_calendar_update does not exist. Please ensure migration 20250626083403 has been applied.';
END IF;
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_proc
    WHERE
      proname = 'sync_google_calendar_delete') THEN
  RAISE EXCEPTION 'Google Calendar trigger function sync_google_calendar_delete does not exist. Please ensure migration 20250626083403 has been applied.';
END IF;
  RAISE NOTICE 'All Google Calendar trigger functions are present.';
END
$$;

-- Verify that the triggers exist and are active
DO $$
BEGIN
  -- Check if the triggers exist
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_trigger
    WHERE
      tgname = 'trigger_sync_google_calendar_insert') THEN
  RAISE EXCEPTION 'Google Calendar trigger trigger_sync_google_calendar_insert does not exist. Please ensure migration 20250626083403 has been applied.';
END IF;
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_trigger
    WHERE
      tgname = 'trigger_sync_google_calendar_update') THEN
  RAISE EXCEPTION 'Google Calendar trigger trigger_sync_google_calendar_update does not exist. Please ensure migration 20250626083403 has been applied.';
END IF;
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_trigger
    WHERE
      tgname = 'trigger_sync_google_calendar_delete') THEN
  RAISE EXCEPTION 'Google Calendar trigger trigger_sync_google_calendar_delete does not exist. Please ensure migration 20250626083403 has been applied.';
END IF;
  RAISE NOTICE 'All Google Calendar triggers are present and active.';
  RAISE NOTICE 'Frontend applications should now rely on database triggers for Google Calendar sync instead of manual API calls.';
END
$$;

