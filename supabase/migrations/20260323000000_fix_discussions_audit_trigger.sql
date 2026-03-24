-- Prevent reactions and reply_count changes from corrupting modified_at on discussions.
--
-- Problem:
--   The update_discussions_audit_fields() trigger compares the row payload
--   minus only view_count and last_activity_at. Any other column change -
--   including reactions (toggled by toggle_reaction()) and reply_count
--   (bumped by the update_discussion_reply_count trigger on INSERT/DELETE
--   of discussion_replies) - falls through to the "meaningful change" branch,
--   which sets modified_at = NOW() and modified_by = auth.uid().
--
--   This causes two visible bugs:
--     1. Reacting to a discussion post sets modified_at = NOW() and
--        modified_by = the reactor's user ID, making the post appear to have
--        been edited moments ago by the reactor.
--     2. Every new reply bumps reply_count, which sets modified_at = NOW()
--        (auth.uid() is NULL in that trigger context, so modified_by is
--        preserved, but the timestamp is still corrupted).
--
--   The corrupted modified_at propagates through the Supabase realtime
--   UPDATE event to the client, which caches it via discussionCache.set().
--   On the next SPA navigation (cache hit), forum/[id].vue displays
--   "Edited a few seconds ago" even when the post content was never changed.
--   A full page reload re-fetches from the DB, which at that point may show
--   a slightly different (but still wrong) time.
--
-- Fix:
--   Extend the skip list to also exclude reactions and reply_count.
--   When the only meaningful differences are view_count, last_activity_at,
--   reactions, and/or reply_count, all audit fields are preserved from OLD.
--   This mirrors the pattern already applied to discussion_replies in
--   migration 20260302034847_discussion_replies_reactions_audit_guard.sql.

CREATE OR REPLACE FUNCTION public.update_discussions_audit_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
DECLARE
  actor       uuid;
  new_payload jsonb;
  old_payload jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Strip all columns that are allowed to change without touching audit fields:
    --   view_count       - incremented by increment_discussion_view_count() RPC
    --   last_activity_at - updated by the reply fanout trigger
    --   reactions        - toggled by toggle_reaction() RPC
    --   reply_count      - bumped by update_discussion_reply_count trigger on
    --                      discussion_replies INSERT / DELETE
    --   modified_at / modified_by / created_at / created_by - audit fields themselves
    new_payload := to_jsonb(NEW)
      - 'view_count'
      - 'last_activity_at'
      - 'reactions'
      - 'reply_count'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';

    old_payload := to_jsonb(OLD)
      - 'view_count'
      - 'last_activity_at'
      - 'reactions'
      - 'reply_count'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';

    -- If the only columns that changed are within the exclusion list above,
    -- preserve all audit fields exactly as they were and return immediately.
    IF new_payload = old_payload THEN
      NEW.modified_at = OLD.modified_at;
      NEW.modified_by = OLD.modified_by;
      NEW.created_at  = OLD.created_at;
      NEW.created_by  = OLD.created_by;
      RETURN NEW;
    END IF;

    -- A meaningful content change occurred - update audit fields normally.
    actor := auth.uid();

    NEW.modified_at = NOW();

    IF actor IS NOT NULL THEN
      NEW.modified_by = actor;
    ELSE
      -- Preserve the last known human editor when called without a user JWT
      -- (e.g. service_role from an edge function or a SECURITY DEFINER trigger).
      NEW.modified_by = OLD.modified_by;
    END IF;

    NEW.created_at = OLD.created_at;
    NEW.created_by = OLD.created_by;
  END IF;

  RETURN NEW;
END;
$function$;

-- Re-attach the trigger (CREATE OR REPLACE only updates the function body;
-- the trigger binding itself is unchanged, but we drop and recreate it to
-- be explicit and consistent with the pattern used in prior migrations).
DROP TRIGGER IF EXISTS update_discussions_audit_fields ON public.discussions;

CREATE TRIGGER update_discussions_audit_fields
  BEFORE UPDATE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_discussions_audit_fields();

GRANT EXECUTE ON FUNCTION public.update_discussions_audit_fields() TO service_role;
