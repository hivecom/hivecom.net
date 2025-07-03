-- Function: notify_discord_ban_status_changed
CREATE OR REPLACE FUNCTION notify_discord_ban_status_changed()
  RETURNS TRIGGER
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
  AS $$
DECLARE
  webhook_url text;
  discord_payload jsonb;
  request_id bigint;
  action text;
BEGIN
  -- Only notify if banned status changed
  IF NEW.banned IS DISTINCT FROM OLD.banned THEN
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
    -- Determine action
    IF NEW.banned = TRUE THEN
      action := '🚫 **User Banned**';
    ELSE
      action := '✅ **User Unbanned**';
    END IF;
    -- Build the Discord webhook payload
    discord_payload := JSONB_BUILD_OBJECT('content', action, 'embeds', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('title', CASE WHEN NEW.banned THEN
            'User Banned'
          ELSE
            'User Unbanned'
          END, 'description', CASE WHEN NEW.banned THEN
            'A user has been banned.'
          ELSE
            'A user has been unbanned.'
          END, 'color', CASE WHEN NEW.banned THEN
            15548997
          ELSE
            5763719
          END, -- Red (0xF04747) or Green (0x57F287)
          'fields', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('name', 'User ID', 'value', NEW.id, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Username', 'value', NEW.username, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Date', 'value', TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS UTC'), 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Reason', 'value', COALESCE(NEW.ban_reason, 'N/A'), 'inline', TRUE)), 'timestamp', TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
    -- Send the webhook request asynchronously
    SELECT
      net.http_post(url := webhook_url, headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json'), body := discord_payload) INTO request_id;
    RAISE NOTICE 'Discord webhook initiated for ban status change (request_id: %)', request_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger: notify_discord_ban_status_changed
DROP TRIGGER IF EXISTS trigger_notify_discord_ban_status_changed ON public.profiles;

CREATE TRIGGER trigger_notify_discord_ban_status_changed
  AFTER UPDATE OF banned ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_discord_ban_status_changed();

-- Grant necessary permissions for the trigger function
GRANT EXECUTE ON FUNCTION notify_discord_ban_status_changed() TO service_role;

-- Function: notify_discord_supporter_status_changed
CREATE OR REPLACE FUNCTION notify_discord_supporter_status_changed()
  RETURNS TRIGGER
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
  AS $$
DECLARE
  webhook_url text;
  discord_payload jsonb;
  request_id bigint;
  changes text := '';
BEGIN
  -- Only notify if supporter status changed
  IF (NEW.supporter_lifetime IS DISTINCT FROM OLD.supporter_lifetime AND NEW.supporter_lifetime = TRUE) OR (NEW.supporter_patreon IS DISTINCT FROM OLD.supporter_patreon AND NEW.supporter_patreon = TRUE) THEN
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
    -- Build change description
    IF NEW.supporter_lifetime IS DISTINCT FROM OLD.supporter_lifetime AND NEW.supporter_lifetime = TRUE THEN
      changes := changes || 'Lifetime Supporter';
    END IF;
    IF NEW.supporter_patreon IS DISTINCT FROM OLD.supporter_patreon AND NEW.supporter_patreon = TRUE THEN
      IF changes <> '' THEN
        changes := changes || ' & ';
      END IF;
      changes := changes || 'Patreon Supporter';
    END IF;
    -- Build the Discord webhook payload
    discord_payload := JSONB_BUILD_OBJECT('content', '💎 **Supporter Status Changed**', 'embeds', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('title', 'User Became Supporter', 'description', 'A user has become a supporter.', 'color', 15844367, -- Gold color (0xF1C40F)
          'fields', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('name', 'User ID', 'value', NEW.id, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Username', 'value', NEW.username, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Supporter Type', 'value', changes, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Date', 'value', TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS UTC'), 'inline', TRUE)), 'timestamp', TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
    -- Send the webhook request asynchronously
    SELECT
      net.http_post(url := webhook_url, headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json'), body := discord_payload) INTO request_id;
    RAISE NOTICE 'Discord webhook initiated for supporter status change (request_id: %)', request_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger: notify_discord_supporter_status_changed
DROP TRIGGER IF EXISTS trigger_notify_discord_supporter_status_changed ON public.profiles;

CREATE TRIGGER trigger_notify_discord_supporter_status_changed
  AFTER UPDATE OF supporter_lifetime,
  supporter_patreon ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_discord_supporter_status_changed();

-- Grant necessary permissions for the trigger function
GRANT EXECUTE ON FUNCTION notify_discord_supporter_status_changed() TO service_role;

-- Migration: Add Discord notifications for user deletions and username changes
-- This migration creates triggers and functions to notify Discord when a user is deleted or changes their username
-- Function: notify_discord_user_deleted
CREATE OR REPLACE FUNCTION notify_discord_user_deleted()
  RETURNS TRIGGER
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
  AS $$
DECLARE
  webhook_url text;
  discord_payload jsonb;
  request_id bigint;
BEGIN
  -- Get the Discord webhook URL from vault
  SELECT
    decrypted_secret INTO webhook_url
  FROM
    vault.decrypted_secrets
  WHERE
    name = 'system_discord_notification_webhook_url';
  -- If no webhook URL is configured, skip notification
  IF webhook_url IS NULL OR webhook_url = 'REPLACE-ME' THEN
    RAISE NOTICE 'Discord webhook URL not configured, skipping notification';
    RETURN OLD;
  END IF;
  -- Build the Discord webhook payload
  discord_payload := JSONB_BUILD_OBJECT('content', '⚠️ **User Deleted**', 'embeds', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('title', 'User Deleted', 'description', 'A user account has been deleted.', 'color', 15105570, -- Orange color (0xE67E22)
        'fields', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('name', 'Email', 'value', OLD.email, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'ID', 'value', OLD.id, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Date', 'value', TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS UTC'), 'inline', TRUE)), 'timestamp', TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
  -- Send the webhook request asynchronously
  SELECT
    net.http_post(url := webhook_url, headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json'), body := discord_payload) INTO request_id;
  RAISE NOTICE 'Discord webhook initiated for user deletion (request_id: %)', request_id;
  RETURN OLD;
END;
$$;

-- Trigger: notify_discord_user_deleted
DROP TRIGGER IF EXISTS trigger_notify_discord_user_deleted ON auth.users;

CREATE TRIGGER trigger_notify_discord_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION notify_discord_user_deleted();

-- Function: notify_discord_username_changed
CREATE OR REPLACE FUNCTION notify_discord_username_changed()
  RETURNS TRIGGER
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
  AS $$
DECLARE
  webhook_url text;
  discord_payload jsonb;
  request_id bigint;
BEGIN
  -- Only notify if username actually changed
  IF NEW.username IS DISTINCT FROM OLD.username THEN
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
    -- Build the Discord webhook payload
    discord_payload := JSONB_BUILD_OBJECT('content', '✏️ **Username Changed**', 'embeds', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('title', 'Username Changed', 'description', 'A user has changed their username.', 'color', 3447003, -- Blue color (0x3498DB)
          'fields', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('name', 'User ID', 'value', NEW.id, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Old Username', 'value', OLD.username, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'New Username', 'value', NEW.username, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Date', 'value', TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS UTC'), 'inline', TRUE)), 'timestamp', TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
    -- Send the webhook request asynchronously
    SELECT
      net.http_post(url := webhook_url, headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json'), body := discord_payload) INTO request_id;
    RAISE NOTICE 'Discord webhook initiated for username change (request_id: %)', request_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger: notify_discord_username_changed
DROP TRIGGER IF EXISTS trigger_notify_discord_username_changed ON public.profiles;

CREATE TRIGGER trigger_notify_discord_username_changed
  AFTER UPDATE OF username ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_discord_username_changed();

-- Grant necessary permissions for the trigger functions
GRANT EXECUTE ON FUNCTION notify_discord_user_deleted() TO service_role;

GRANT EXECUTE ON FUNCTION notify_discord_username_changed() TO service_role;

