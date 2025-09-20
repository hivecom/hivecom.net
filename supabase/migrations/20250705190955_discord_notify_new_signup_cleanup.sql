-- Migration: Clean up Discord notification function for new user signups (remove placeholder URLs)
-- This migration updates the notify_discord_new_signup function to remove hardcoded placeholder URLs
CREATE OR REPLACE FUNCTION notify_discord_new_signup()
  RETURNS TRIGGER
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
  AS $$
DECLARE
  webhook_url text;
  request_id bigint;
BEGIN
  -- Get the Discord webhook URL from vault
  SELECT
    decrypted_secret INTO webhook_url
  FROM
    vault.decrypted_secrets
  WHERE
    name = 'system_discord_notification_webhook_url';
  IF webhook_url IS NULL OR webhook_url = 'REPLACE-ME' THEN
    RAISE NOTICE 'Discord webhook URL not configured, skipping notification';
    RETURN NEW;
  END IF;
  -- Send a message to Discord (clean version without placeholder URLs)
  SELECT
    net.http_post(url := webhook_url, headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json'), body := JSONB_BUILD_OBJECT('content', '🎉 **New User Signup**', 'embeds', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('title', 'New User Registered', 'description', 'A new user has signed up.', 'color', 3066993, 'fields', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('name', 'Email', 'value', NEW.email, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Date', 'value', TO_CHAR(NEW.created_at, 'YYYY-MM-DD HH24:MI:SS UTC'), 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'User ID', 'value', NEW.id::text, 'inline', TRUE)), 'timestamp', TO_CHAR(NEW.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))))) INTO request_id;
  RAISE NOTICE 'Discord webhook sent (request_id: %)', request_id;
  RETURN NEW;
END;
$$;

-- Re-grant necessary permissions for the trigger function
GRANT EXECUTE ON FUNCTION notify_discord_new_signup() TO service_role;

