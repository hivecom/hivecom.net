-- Allow discussion authors to reply to their own draft discussions
--
-- Previously, the `prevent_replies_on_draft_discussion` trigger unconditionally
-- blocked all replies on draft discussions. This update allows the discussion
-- author to add replies to their own drafts while still blocking others.
--
-- The `enforce_discussion_draft_rules` trigger on the discussions table also
-- blocked drafts from having any replies (via reply_count check). This is
-- relaxed since `prevent_replies_on_draft_discussion` is the proper guard
-- for who can reply to drafts.

-- 1) Update the reply guard to allow the discussion author
CREATE OR REPLACE FUNCTION public.prevent_replies_on_draft_discussion()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.discussions d
    WHERE d.id = NEW.discussion_id
      AND d.is_draft = true
      AND (
        auth.uid() IS NULL
        OR (
          d.created_by != auth.uid()
          AND NOT authorize('discussions.update'::public.app_permission)
        )
      )
  ) THEN
    RAISE EXCEPTION 'Cannot add replies to draft discussions';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) Relax the draft enforcement on the discussions table
--    Keep the "cannot revert to draft" rule but remove reply_count checks
--    since `prevent_replies_on_draft_discussion` is the authority on who can
--    reply to drafts.
CREATE OR REPLACE FUNCTION public.enforce_discussion_draft_rules()
RETURNS TRIGGER AS $$
BEGIN
  -- Block turning existing discussions into drafts
  IF TG_OP = 'UPDATE' AND OLD.is_draft = false AND NEW.is_draft = true THEN
    RAISE EXCEPTION 'Discussions cannot be set back to draft once published';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
