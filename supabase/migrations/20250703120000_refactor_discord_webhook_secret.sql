-- Migration: Refactor Discord complaint webhook secret name
-- This migration renames the Discord webhook secret for complaints to a more general system notification webhook secret
DO $$
DECLARE
BEGIN
  -- Remove the old secret if it exists (optional, safe to ignore errors)
  BEGIN
    PERFORM
      vault.delete_secret('discord_complaint_webhook_url');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Old secret might not exist: %', SQLERRM;
  END;
  -- Create the new secret
  PERFORM
    vault.create_secret('REPLACE-ME', 'system_discord_notification_webhook_url');
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'System notification webhook secret might already exist: %', SQLERRM;
END
$$;

-- Update the function to use the new secret name
CREATE OR REPLACE FUNCTION notify_discord_new_complaint()
  RETURNS TRIGGER
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
  AS $$
DECLARE
  webhook_url text;
  complaint_author text;
  context_info text := '';
  discord_payload jsonb;
  request_id bigint;
BEGIN
  -- Get the Discord webhook URL from vault (new secret name)
  SELECT
    decrypted_secret INTO webhook_url
  FROM
    vault.decrypted_secrets
  WHERE
    name = 'system_discord_notification_webhook_url';
  -- If no webhook URL is configured, skip notification
  IF webhook_url IS NULL OR webhook_url = 'REPLACE-ME' THEN
    RAISE NOTICE 'Discord webhook URL not configured, skipping notification';
    RETURN NEW;
  END IF;
  -- Get the complaint author's username
  SELECT
    COALESCE(p.username, 'Unknown User') INTO complaint_author
  FROM
    public.profiles p
  WHERE
    p.id = NEW.created_by;
  -- Build context information if available
  IF NEW.context_user IS NOT NULL THEN
    SELECT
      'About user: ' || COALESCE(p.username, 'Unknown User') INTO context_info
    FROM
      public.profiles p
    WHERE
      p.id = NEW.context_user;
  ELSIF NEW.context_gameserver IS NOT NULL THEN
    SELECT
      'About server: ' || COALESCE(gs.name, 'Unknown Server') INTO context_info
    FROM
      public.gameservers gs
    WHERE
      gs.id = NEW.context_gameserver;
  END IF;
  -- Build the Discord webhook payload
  discord_payload := JSONB_BUILD_OBJECT('content', '🚨 **New Complaint Submitted**', 'embeds', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('title', 'Complaint #' || NEW.id, 'description', NEW.message, 'color', 15158332, -- Red color (0xE74C3C)
        'fields', JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('name', 'Submitted by', 'value', complaint_author, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Context', 'value', CASE WHEN context_info = '' THEN
              'None'
            ELSE
              context_info
            END, 'inline', TRUE), JSONB_BUILD_OBJECT('name', 'Date', 'value', TO_CHAR(NEW.created_at, 'YYYY-MM-DD HH24:MI:SS UTC'), 'inline', TRUE)), 'timestamp', TO_CHAR(NEW.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
  -- Send the webhook request asynchronously (fire and forget)
  SELECT
    net.http_post(url := webhook_url, headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json'), body := discord_payload) INTO request_id;
  -- Log that we initiated the request (no need to wait for response)
  RAISE NOTICE 'Discord webhook initiated for complaint #% (request_id: %)', NEW.id, request_id;
  RETURN NEW;
END;
$$;

-- Recreate the trigger (no change needed)
DROP TRIGGER IF EXISTS trigger_notify_discord_new_complaint ON public.complaints;

CREATE TRIGGER trigger_notify_discord_new_complaint
  AFTER INSERT ON public.complaints
  FOR EACH ROW
  EXECUTE FUNCTION notify_discord_new_complaint();

-- Grant necessary permissions for the trigger function
GRANT EXECUTE ON FUNCTION notify_discord_new_complaint() TO service_role;

