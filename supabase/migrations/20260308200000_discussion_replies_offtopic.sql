-- Add off-topic flagging for discussion replies
--
-- Features:
--   1. New `is_offtopic` boolean column on discussion_replies
--   2. Permission guard: only the discussion author (OP) or users with
--      discussions.update permission (admins/moderators) can toggle is_offtopic
--   3. Cascade trigger: when a reply is marked off-topic, all descendant
--      replies (children, grandchildren, etc.) inherit is_offtopic = true
--   4. Audit field guard update: toggling is_offtopic should NOT bump
--      modified_at/modified_by on the reply row (same treatment as reactions)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add column
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.discussion_replies
  ADD COLUMN is_offtopic boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.discussion_replies.is_offtopic
  IS 'When true the reply is considered off-topic by the discussion author or a moderator. Hidden by default in the UI unless the viewer opts in.';

CREATE INDEX discussion_replies_is_offtopic_idx
  ON public.discussion_replies (discussion_id)
  WHERE is_offtopic = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Permission guard trigger
--    Only the discussion OP or discussions.update holders may flip is_offtopic.
--    Reply authors themselves cannot change it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_reply_offtopic_field()
RETURNS TRIGGER AS $$
DECLARE
  discussion_author uuid;
BEGIN
  -- Nothing to guard if is_offtopic didn't change
  IF OLD.is_offtopic IS NOT DISTINCT FROM NEW.is_offtopic THEN
    RETURN NEW;
  END IF;

  -- Admins / moderators can always toggle
  IF authorize('discussions.update'::public.app_permission) THEN
    RETURN NEW;
  END IF;

  -- The discussion author (OP) can toggle on replies in their discussion
  SELECT d.created_by INTO discussion_author
  FROM public.discussions d
  WHERE d.id = NEW.discussion_id;

  IF auth.uid() = discussion_author THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Insufficient permissions to modify off-topic status on this reply';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER protect_reply_offtopic_field_trigger
  BEFORE UPDATE ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_reply_offtopic_field();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cascade trigger
--    When a reply is marked is_offtopic = true, recursively mark all
--    descendant replies as off-topic as well.
--    When a reply is unmarked (set back to false), descendants are also
--    unmarked so the OP / mod can undo the cascade.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cascade_reply_offtopic()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when is_offtopic actually changed
  IF OLD.is_offtopic IS NOT DISTINCT FROM NEW.is_offtopic THEN
    RETURN NEW;
  END IF;

  -- Recursively update all descendants to match the new state
  WITH RECURSIVE descendants AS (
    -- Direct children of the changed reply
    SELECT id
    FROM public.discussion_replies
    WHERE reply_to_id = NEW.id
      AND is_offtopic IS DISTINCT FROM NEW.is_offtopic

    UNION ALL

    -- Their children, grandchildren, etc.
    SELECT r.id
    FROM public.discussion_replies r
    INNER JOIN descendants d ON r.reply_to_id = d.id
    WHERE r.is_offtopic IS DISTINCT FROM NEW.is_offtopic
  )
  UPDATE public.discussion_replies
  SET is_offtopic = NEW.is_offtopic
  WHERE id IN (SELECT id FROM descendants);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER cascade_reply_offtopic_trigger
  AFTER UPDATE ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_reply_offtopic();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Inherit off-topic on INSERT
--    When a new reply is created as a child of an off-topic reply, it
--    automatically inherits is_offtopic = true regardless of what the
--    inserting user specified.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inherit_reply_offtopic_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reply_to_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.discussion_replies
      WHERE id = NEW.reply_to_id
        AND is_offtopic = true
    ) THEN
      NEW.is_offtopic := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER inherit_reply_offtopic_on_insert_trigger
  BEFORE INSERT ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_reply_offtopic_on_insert();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Update audit field guard
--    Toggling is_offtopic (by the OP or a moderator) should not change the
--    reply's modified_at / modified_by, since it is a moderation action not a
--    content edit. We strip is_offtopic from the diff payload alongside
--    reactions.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_discussion_replies_audit_fields()
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
    -- Strip columns that are allowed to change without touching audit fields:
    --   reactions    – toggled by any authenticated user via toggle_reaction()
    --   is_offtopic  – toggled by the OP or moderator as a moderation action
    --   modified_at / modified_by / created_at / created_by – audit fields themselves
    new_payload := to_jsonb(NEW)
      - 'reactions'
      - 'is_offtopic'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';

    old_payload := to_jsonb(OLD)
      - 'reactions'
      - 'is_offtopic'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';

    -- If the only columns that changed are reactions / is_offtopic (and/or the
    -- audit fields themselves), preserve all audit values from the previous
    -- state and return immediately – no audit bump.
    IF new_payload = old_payload THEN
      NEW.modified_at = OLD.modified_at;
      NEW.modified_by = OLD.modified_by;
      NEW.created_at  = OLD.created_at;
      NEW.created_by  = OLD.created_by;
      RETURN NEW;
    END IF;

    -- A meaningful content change happened – update audit fields normally.
    actor := auth.uid();

    NEW.modified_at = NOW();

    IF actor IS NOT NULL THEN
      NEW.modified_by = actor;
    ELSE
      -- Preserve the last known human editor when called without a user JWT
      -- (e.g. service_role from an edge function).
      NEW.modified_by = OLD.modified_by;
    END IF;

    NEW.created_at = OLD.created_at;
    NEW.created_by = OLD.created_by;
  END IF;

  RETURN NEW;
END;
$function$;

-- Recreate the trigger (function signature unchanged, just rebound)
DROP TRIGGER IF EXISTS update_discussion_replies_audit_fields ON public.discussion_replies;

CREATE TRIGGER update_discussion_replies_audit_fields
  BEFORE UPDATE ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_discussion_replies_audit_fields();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Content guard trigger
--    When someone other than the reply author updates a reply (e.g. the
--    discussion OP toggling is_offtopic), ensure they cannot modify content
--    fields. Only is_offtopic, reactions, and audit fields may change.
--    Users with discussions.update (admins/moderators) are exempt.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_reply_content_from_non_author()
RETURNS TRIGGER AS $$
DECLARE
  actor uuid;
  old_content jsonb;
  new_content jsonb;
BEGIN
  actor := auth.uid();

  -- Reply author can edit their own content freely
  IF actor = OLD.created_by THEN
    RETURN NEW;
  END IF;

  -- Admins / moderators can edit any reply content
  IF authorize('discussions.update'::public.app_permission) THEN
    RETURN NEW;
  END IF;

  -- Everyone else (e.g. discussion OP) may only change moderation fields.
  -- Compare the row minus moderation / audit / reaction columns.
  old_content := to_jsonb(OLD)
    - 'is_offtopic'
    - 'reactions'
    - 'modified_at'
    - 'modified_by'
    - 'created_at'
    - 'created_by';

  new_content := to_jsonb(NEW)
    - 'is_offtopic'
    - 'reactions'
    - 'modified_at'
    - 'modified_by'
    - 'created_at'
    - 'created_by';

  IF old_content IS DISTINCT FROM new_content THEN
    RAISE EXCEPTION 'You may only change moderation fields on replies you did not author';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER protect_reply_content_from_non_author_trigger
  BEFORE UPDATE ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_reply_content_from_non_author();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS policy: allow discussion authors to update replies in their threads
--    This lets the OP toggle is_offtopic on any reply within their discussion.
--    The protect_reply_offtopic_field trigger ensures they can only change
--    is_offtopic and no other fields.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Discussion authors can update replies in their discussions"
  ON public.discussion_replies FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.discussions d
      WHERE d.id = discussion_id
        AND d.created_by = auth.uid()
    )
  );

COMMIT;
