-- Migration: Add Discord notification for new user signups
-- This migration creates a trigger and function to notify Discord when a new user signs up via Supabase auth
DO $$
DECLARE
BEGIN
  -- Create the system notification webhook secret if it doesn't exist (safe to ignore errors)
  BEGIN
    PERFORM
      vault.create_secret('REPLACE-ME', 'system_discord_notification_webhook_url');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'System notification webhook secret might already exist: %', SQLERRM;
  END;
END
$$;

-- Create a function to send Discord webhook notifications for new user signups
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
  -- Send a more detailed message to Discord
  SELECT
    net.http_post(url := webhook_url, headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json'), body := JSONB_BUILD_OBJECT('content', '🎉 **New User Signup**', 'embeds', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('title', 'New User Registered', 'description', 'A new user has signed up.', 'color', 3066993, 'fields', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('name', 'Email', 'value', NEW.email, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Date', 'value', TO_CHAR(NEW.created_at, 'YYYY-MM-DD HH24:MI:SS UTC'), 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'User ID', 'value', NEW.id::text, 'inline', TRUE)), 'footer', JSONB_BUILD_OBJECT('text', 'Hivecom Signup Bot'), 'url', 'https://your-app-url.com/admin/users/' || NEW.id::text, 'thumbnail', JSONB_BUILD_OBJECT('url', 'https://your-app-url.com/path/to/logo.png'), 'timestamp', TO_CHAR(NEW.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))))) INTO request_id;
  RAISE NOTICE 'Discord webhook sent (request_id: %)', request_id;
  RETURN NEW;
END;
$$;

-- Create the trigger that fires after a new user is inserted into auth.users
DROP TRIGGER IF EXISTS trigger_notify_discord_new_signup ON auth.users;

CREATE TRIGGER trigger_notify_discord_new_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION notify_discord_new_signup();

-- Grant necessary permissions for the trigger function
GRANT EXECUTE ON FUNCTION notify_discord_new_signup() TO service_role;

