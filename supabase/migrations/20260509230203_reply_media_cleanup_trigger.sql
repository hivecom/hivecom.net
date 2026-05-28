-- Trigger-driven media cleanup for discussions and discussion replies.
--
-- Covers three cases:
--
--   1. REPLY SOFT DELETE - is_deleted flips to true on discussion_replies.
--      The existing scrub_discussion_reply_on_soft_delete trigger fires BEFORE
--      UPDATE and wipes NEW.markdown. We must read OLD.markdown here while it
--      still exists, so this trigger also fires BEFORE UPDATE on is_deleted
--      and is named so it sorts alphabetically before the scrub trigger
--      ("cleanup_" < "scrub_"), guaranteeing correct execution order.
--
--   2. REPLY HARD DELETE - AFTER DELETE on discussion_replies (covers
--      force-delete by admins and CASCADE deletes from parent rows).
--
--   3. DISCUSSION HARD DELETE - AFTER DELETE on discussions (covers admin
--      deletes and CASCADE deletes from profile/event/project/gameserver rows).
--      Discussions have no soft-delete mechanism.
--
-- All functions fire net.http_post asynchronously so they never block the
-- calling transaction. If secrets are not configured the trigger is a no-op.

-- ── Reply soft delete: BEFORE UPDATE on is_deleted ───────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_reply_media_on_soft_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  project_url    text;
  anon_key       text;
  trigger_secret text;
  request_id     bigint;
BEGIN
  -- Only act when a reply transitions from not-deleted to deleted.
  IF OLD.is_deleted IS NOT DISTINCT FROM true OR NEW.is_deleted IS NOT DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  -- Skip if there is no markdown content to scan.
  IF OLD.markdown IS NULL OR OLD.markdown = '' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key';
  SELECT decrypted_secret INTO trigger_secret
    FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR anon_key IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Discussion media cleanup secrets not configured, skipping for reply %', OLD.id;
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url     := project_url || '/functions/v1/trigger-cleanup-discussion-media',
    headers := jsonb_build_object(
      'Content-Type',          'application/json',
      'Authorization',         'Bearer ' || anon_key,
      'System-Trigger-Secret', trigger_secret
    ),
    body    := jsonb_build_object(
      'entityId',   OLD.id,
      'entityType', 'reply',
      'markdown',   OLD.markdown,
      'action',     'SOFT_DELETE'
    )
  ) INTO request_id;

  RAISE NOTICE 'Discussion media cleanup (reply SOFT_DELETE) initiated for reply % (request_id: %)', OLD.id, request_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_reply_media_on_soft_delete_trigger ON public.discussion_replies;

-- Must run BEFORE the scrub trigger so OLD.markdown is still intact.
-- scrub_discussion_reply_on_soft_delete_trigger is also BEFORE UPDATE, and
-- Postgres runs BEFORE triggers in alphabetical name order, so prefix with
-- "cleanup_" (comes before "scrub_") to guarantee ordering.
CREATE TRIGGER cleanup_reply_media_on_soft_delete_trigger
  BEFORE UPDATE OF is_deleted ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_reply_media_on_soft_delete();

GRANT EXECUTE ON FUNCTION public.cleanup_reply_media_on_soft_delete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_reply_media_on_soft_delete() TO service_role;

-- ── Reply hard delete: AFTER DELETE on discussion_replies ─────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_reply_media_on_hard_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  project_url    text;
  anon_key       text;
  trigger_secret text;
  request_id     bigint;
BEGIN
  -- Skip soft-deleted rows: their markdown was already wiped (and the
  -- soft-delete trigger already fired cleanup), so there is nothing to do.
  IF OLD.is_deleted = true THEN
    RETURN OLD;
  END IF;

  -- Skip if there is no markdown content to scan.
  IF OLD.markdown IS NULL OR OLD.markdown = '' THEN
    RETURN OLD;
  END IF;

  SELECT decrypted_secret INTO project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key';
  SELECT decrypted_secret INTO trigger_secret
    FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR anon_key IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Discussion media cleanup secrets not configured, skipping for reply %', OLD.id;
    RETURN OLD;
  END IF;

  SELECT net.http_post(
    url     := project_url || '/functions/v1/trigger-cleanup-discussion-media',
    headers := jsonb_build_object(
      'Content-Type',          'application/json',
      'Authorization',         'Bearer ' || anon_key,
      'System-Trigger-Secret', trigger_secret
    ),
    body    := jsonb_build_object(
      'entityId',   OLD.id,
      'entityType', 'reply',
      'markdown',   OLD.markdown,
      'action',     'HARD_DELETE'
    )
  ) INTO request_id;

  RAISE NOTICE 'Discussion media cleanup (reply HARD_DELETE) initiated for reply % (request_id: %)', OLD.id, request_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_reply_media_on_hard_delete_trigger ON public.discussion_replies;

CREATE TRIGGER cleanup_reply_media_on_hard_delete_trigger
  AFTER DELETE ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_reply_media_on_hard_delete();

GRANT EXECUTE ON FUNCTION public.cleanup_reply_media_on_hard_delete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_reply_media_on_hard_delete() TO service_role;

-- ── Discussion hard delete: AFTER DELETE on discussions ───────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_discussion_media_on_hard_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  project_url    text;
  anon_key       text;
  trigger_secret text;
  request_id     bigint;
BEGIN
  -- Skip if there is no markdown content to scan.
  IF OLD.markdown IS NULL OR OLD.markdown = '' THEN
    RETURN OLD;
  END IF;

  SELECT decrypted_secret INTO project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key';
  SELECT decrypted_secret INTO trigger_secret
    FROM vault.decrypted_secrets WHERE name = 'system_trigger_secret';

  IF project_url IS NULL OR anon_key IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'Discussion media cleanup secrets not configured, skipping for discussion %', OLD.id;
    RETURN OLD;
  END IF;

  SELECT net.http_post(
    url     := project_url || '/functions/v1/trigger-cleanup-discussion-media',
    headers := jsonb_build_object(
      'Content-Type',          'application/json',
      'Authorization',         'Bearer ' || anon_key,
      'System-Trigger-Secret', trigger_secret
    ),
    body    := jsonb_build_object(
      'entityId',   OLD.id,
      'entityType', 'discussion',
      'markdown',   OLD.markdown,
      'action',     'HARD_DELETE'
    )
  ) INTO request_id;

  RAISE NOTICE 'Discussion media cleanup (discussion HARD_DELETE) initiated for discussion % (request_id: %)', OLD.id, request_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_discussion_media_on_hard_delete_trigger ON public.discussions;

CREATE TRIGGER cleanup_discussion_media_on_hard_delete_trigger
  AFTER DELETE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_discussion_media_on_hard_delete();

GRANT EXECUTE ON FUNCTION public.cleanup_discussion_media_on_hard_delete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_discussion_media_on_hard_delete() TO service_role;
