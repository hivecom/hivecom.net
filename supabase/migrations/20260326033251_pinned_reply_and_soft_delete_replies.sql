-- =============================================================================
-- pinned_reply_and_soft_delete_replies
--
-- 1. Add `pinned_reply_id` to discussions.
--    Lets the discussion author, moderators, and admins pin one reply as
--    pinned (e.g. to surface an important answer or announcement).
--
-- 2. Switch discussion_replies to soft deletion.
--    The `is_deleted` column already exists. This migration:
--    - Updates update_discussion_reply_count() to decrement on soft-delete
--      (UPDATE flipping is_deleted false -> true) and re-fire on hard DELETE
--      as a safety net for any admin/service-role hard deletes.
--    - Rebuilds the trigger to fire on INSERT, DELETE, and UPDATE OF is_deleted.
--    - Extends protect_discussion_admin_fields() to guard pinned_reply_id.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. pinned_reply_id on discussions
-- -----------------------------------------------------------------------------

ALTER TABLE public.discussions
  ADD COLUMN IF NOT EXISTS pinned_reply_id uuid
    REFERENCES public.discussion_replies(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS discussions_pinned_reply_id_idx
  ON public.discussions(pinned_reply_id);

COMMENT ON COLUMN public.discussions.pinned_reply_id IS
  'An optional reply pinned by the discussion author, a moderator, or an admin '
  'as the pinned reply (e.g. a resolved answer or an important notice in the thread).';

-- Validation trigger: ensures pinned_reply_id, when set, belongs to this
-- discussion - mirrors the existing validate_discussion_accepted_reply pattern.
CREATE OR REPLACE FUNCTION public.validate_discussion_pinned_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.pinned_reply_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.discussion_replies
      WHERE id = NEW.pinned_reply_id
        AND discussion_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Pinned reply must belong to the discussion';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_discussion_pinned_reply_trigger ON public.discussions;

CREATE TRIGGER validate_discussion_pinned_reply_trigger
  BEFORE INSERT OR UPDATE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_discussion_pinned_reply();

GRANT EXECUTE ON FUNCTION public.validate_discussion_pinned_reply() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_discussion_pinned_reply() TO service_role;


-- -----------------------------------------------------------------------------
-- 2. Soft-delete aware reply_count maintenance
--
-- reply_count should reflect the number of non-deleted replies:
--   INSERT                              -> +1
--   DELETE (hard, safety net)           -> -1
--   UPDATE is_deleted: false -> true    -> -1 (soft delete)
--   UPDATE is_deleted: true  -> false   -> +1 (soft un-delete)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_discussion_reply_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.discussions
    SET reply_count = reply_count + 1
    WHERE id = NEW.discussion_id;

  ELSIF TG_OP = 'DELETE' THEN
    -- Hard delete (admin/service-role safety net). Only adjust if the row
    -- was not already soft-deleted, otherwise reply_count was already decremented.
    IF OLD.is_deleted = false THEN
      UPDATE public.discussions
      SET reply_count = reply_count - 1
      WHERE id = OLD.discussion_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Soft delete: false -> true
    IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
      UPDATE public.discussions
      SET reply_count = reply_count - 1
      WHERE id = NEW.discussion_id;
    -- Soft un-delete: true -> false
    ELSIF OLD.is_deleted = true AND NEW.is_deleted = false THEN
      UPDATE public.discussions
      SET reply_count = reply_count + 1
      WHERE id = NEW.discussion_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Rebuild trigger to fire on INSERT, DELETE, and UPDATE OF is_deleted only.
-- Scoping UPDATE to the is_deleted column avoids unnecessary trigger overhead
-- on every other field edit.
DROP TRIGGER IF EXISTS update_discussion_reply_count_trigger ON public.discussion_replies;

CREATE TRIGGER update_discussion_reply_count_trigger
  AFTER INSERT OR DELETE OR UPDATE OF is_deleted ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_discussion_reply_count();


-- -----------------------------------------------------------------------------
-- 2b. Clear pinned reply when a reply is deleted or soft deleted
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clear_pinned_reply_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.discussions
    SET pinned_reply_id = NULL
    WHERE pinned_reply_id = OLD.id;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
      UPDATE public.discussions
      SET pinned_reply_id = NULL
      WHERE pinned_reply_id = NEW.id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS clear_pinned_reply_on_delete_trigger ON public.discussion_replies;

CREATE TRIGGER clear_pinned_reply_on_delete_trigger
  AFTER DELETE OR UPDATE OF is_deleted ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_pinned_reply_on_delete();

GRANT EXECUTE ON FUNCTION public.clear_pinned_reply_on_delete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pinned_reply_on_delete() TO service_role;


-- -----------------------------------------------------------------------------
-- 3. Extend protect_discussion_admin_fields to guard pinned_reply_id.
--
-- Rules:
--   is_sticky        - discussions.update only
--   is_locked        - discussions.update, OR discussion author (lock only)
--   pinned_reply_id  - discussions.update, OR discussion author
--
-- Restructured to validate all changed fields in a single pass rather than
-- returning early inside individual branches.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_discussion_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- is_sticky: requires discussions.update permission.
  IF (OLD.is_sticky IS DISTINCT FROM NEW.is_sticky) THEN
    IF NOT public.authorize('discussions.update'::public.app_permission) THEN
      RAISE EXCEPTION 'Insufficient permissions to modify sticky status';
    END IF;
  END IF;

  -- is_locked: discussions.update, or discussion author locking (not unlocking).
  IF (OLD.is_locked IS DISTINCT FROM NEW.is_locked) THEN
    IF NOT public.authorize('discussions.update'::public.app_permission) THEN
      IF NOT (auth.uid() = OLD.created_by AND NEW.is_locked = true) THEN
        RAISE EXCEPTION 'Insufficient permissions to modify lock status';
      END IF;
    END IF;
  END IF;

  -- pinned_reply_id: discussions.update, or the discussion author.
  IF (OLD.pinned_reply_id IS DISTINCT FROM NEW.pinned_reply_id) THEN
    IF NOT public.authorize('discussions.update'::public.app_permission) THEN
      IF auth.uid() IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Insufficient permissions to modify pinned reply';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_discussion_fields_trigger ON public.discussions;

CREATE TRIGGER protect_discussion_fields_trigger
  BEFORE UPDATE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_discussion_admin_fields();

GRANT EXECUTE ON FUNCTION public.protect_discussion_admin_fields() TO authenticated;
GRANT EXECUTE ON FUNCTION public.protect_discussion_admin_fields() TO service_role;
