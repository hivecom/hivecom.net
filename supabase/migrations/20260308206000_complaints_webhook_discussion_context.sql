-- Fix Discord webhook trigger to include discussion and discussion_reply context
--
-- The existing notify_discord_new_complaint() function builds context info for
-- context_user and context_gameserver but completely ignores the
-- context_discussion and context_discussion_reply columns added in
-- 20260301060439_complaints_discussion_context.sql.
--
-- This migration recreates the function to handle all four context types,
-- building a richer embed for complaints tied to discussions and replies.

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
    RETURN NEW;
  END IF;

  -- Get the complaint author's username
  SELECT
    COALESCE(p.username, 'Unknown User') INTO complaint_author
  FROM
    public.profiles p
  WHERE
    p.id = NEW.created_by;

  -- Build context information from all possible context columns.
  -- A complaint may reference multiple contexts (e.g. a discussion reply AND
  -- its parent discussion), so we concatenate all that apply.

  IF NEW.context_user IS NOT NULL THEN
    SELECT
      'About user: ' || COALESCE(p.username, 'Unknown User') INTO context_info
    FROM
      public.profiles p
    WHERE
      p.id = NEW.context_user;
  END IF;

  IF NEW.context_gameserver IS NOT NULL THEN
    DECLARE
      gs_name text;
    BEGIN
      SELECT
        COALESCE(gs.name, 'Unknown Server') INTO gs_name
      FROM
        public.gameservers gs
      WHERE
        gs.id = NEW.context_gameserver;

      IF context_info != '' THEN
        context_info := context_info || ' | ';
      END IF;
      context_info := context_info || 'About server: ' || gs_name;
    END;
  END IF;

  IF NEW.context_discussion IS NOT NULL THEN
    DECLARE
      disc_title text;
      disc_slug text;
    BEGIN
      SELECT
        COALESCE(d.title, 'Untitled discussion'),
        d.slug
      INTO disc_title, disc_slug
      FROM
        public.discussions d
      WHERE
        d.id = NEW.context_discussion;

      IF context_info != '' THEN
        context_info := context_info || ' | ';
      END IF;
      context_info := context_info || 'Discussion: ' || disc_title;

      -- Append a link hint using the slug if available, otherwise the UUID
      IF disc_slug IS NOT NULL THEN
        context_info := context_info || ' (/forum/' || disc_slug || ')';
      ELSE
        context_info := context_info || ' (/forum/' || NEW.context_discussion || ')';
      END IF;
    END;
  END IF;

  IF NEW.context_discussion_reply IS NOT NULL THEN
    DECLARE
      reply_preview text;
      reply_author text;
    BEGIN
      SELECT
        LEFT(COALESCE(r.markdown, ''), 120),
        COALESCE(p.username, 'Unknown User')
      INTO reply_preview, reply_author
      FROM
        public.discussion_replies r
        LEFT JOIN public.profiles p ON p.id = r.created_by
      WHERE
        r.id = NEW.context_discussion_reply;

      IF context_info != '' THEN
        context_info := context_info || ' | ';
      END IF;
      context_info := context_info || 'Reply by ' || reply_author || ': "' || reply_preview;

      -- Close the quote and add ellipsis if the preview was truncated
      IF LENGTH(reply_preview) >= 120 THEN
        context_info := context_info || '..."';
      ELSE
        context_info := context_info || '"';
      END IF;
    END;
  END IF;

  -- Build the Discord webhook payload
  discord_payload := jsonb_build_object(
    'content', '🚨 **New Complaint Submitted**',
    'embeds', jsonb_build_array(
      jsonb_build_object(
        'title', 'Complaint #' || NEW.id,
        'description', NEW.message,
        'color', 15158332, -- Red color (0xE74C3C)
        'fields', jsonb_build_array(
          jsonb_build_object(
            'name', 'Submitted by',
            'value', complaint_author,
            'inline', true
          ),
          jsonb_build_object(
            'name', 'Context',
            'value', CASE WHEN context_info = '' THEN 'None' ELSE context_info END,
            'inline', true
          ),
          jsonb_build_object(
            'name', 'Date',
            'value', to_char(NEW.created_at, 'YYYY-MM-DD HH24:MI:SS UTC'),
            'inline', true
          )
        ),
        'timestamp', to_char(NEW.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
  );

  -- Send the webhook request asynchronously (fire and forget)
  SELECT
    net.http_post(
      url := webhook_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := discord_payload
    ) INTO request_id;

  -- Log that we initiated the request (no need to wait for response)
  RAISE NOTICE 'Discord webhook initiated for complaint #% (request_id: %)', NEW.id, request_id;
  RETURN NEW;
END;
$$;

-- Recreate the trigger (function signature unchanged, just rebound)
DROP TRIGGER IF EXISTS trigger_notify_discord_new_complaint ON public.complaints;

CREATE TRIGGER trigger_notify_discord_new_complaint
  AFTER INSERT ON public.complaints
  FOR EACH ROW
  EXECUTE FUNCTION notify_discord_new_complaint();
