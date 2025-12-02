-- This migration creates a Discord webhook trigger for Supabase auth email changes
-- Ensure the vault secret is created before applying the migration:
-- DO $$
-- BEGIN
--   PERFORM vault.create_secret('REPLACE-ME', 'discord_email_change_webhook_url');
-- EXCEPTION
--   WHEN OTHERS THEN
--     RAISE NOTICE 'Discord email change webhook secret might already exist: %', SQLERRM;
-- END
-- $$;
CREATE OR REPLACE FUNCTION public.notify_discord_email_change()
  RETURNS TRIGGER
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
  AS $$
DECLARE
  webhook_url text;
  username text;
  discord_payload jsonb;
  request_id bigint;
BEGIN
  -- Fetch webhook URL from vault
  SELECT
    decrypted_secret INTO webhook_url
  FROM
    vault.decrypted_secrets
  WHERE
    name = 'discord_email_change_webhook_url';
  IF webhook_url IS NULL OR webhook_url = 'REPLACE-ME' THEN
    RAISE NOTICE 'Discord email change webhook URL not configured, skipping notification';
    RETURN NEW;
  END IF;
  -- Resolve username if available
  SELECT
    COALESCE(p.username, 'Unknown User') INTO username
  FROM
    public.profiles p
  WHERE
    p.id = NEW.id;
  IF username IS NULL THEN
    username := 'Unknown User';
  END IF;
  -- Build webhook payload
  discord_payload := JSONB_BUILD_OBJECT('content', '✉️ **User Email Changed**', 'embeds', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('title', 'User ' || NEW.id, 'color', 5793266, -- 0x5865F2 (discord blurple)
        'fields', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('name', 'Username', 'value', username, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Old Email', 'value', COALESCE(OLD.email, 'Unknown'), 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'New Email', 'value', NEW.email, 'inline', TRUE)), 'timestamp', TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
  -- Send webhook request asynchronously
  SELECT
    net.http_post(url := webhook_url, headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json'), body := discord_payload) INTO request_id;
  RAISE NOTICE 'Discord webhook initiated for auth user % (request_id: %)', NEW.id, request_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_discord_email_change ON auth.users;

CREATE TRIGGER trigger_notify_discord_email_change
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN(NEW.email IS DISTINCT FROM OLD.email)
  EXECUTE FUNCTION public.notify_discord_email_change();

GRANT EXECUTE ON FUNCTION public.notify_discord_email_change() TO service_role;

