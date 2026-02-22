-- Add draft flag and enforce draft visibility/reply safeguards for discussions

BEGIN;

-- 1) Add is_draft column
ALTER TABLE public.discussions
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.discussions.is_draft IS 'Marks discussions as drafts (visible only to creator and moderators/admins).';

-- 2) Update discussion visibility policy to hide drafts from non-owners/moderators
DROP POLICY IF EXISTS "Everyone can view discussions" ON public.discussions;

CREATE POLICY "Everyone can view discussions"
  ON public.discussions FOR SELECT
  USING (
    is_draft = false
    OR auth.uid() = created_by
    OR authorize('discussions.update'::app_permission)
    OR authorize('discussions.manage'::app_permission)
  );

-- 3) Update replies visibility policy to mirror draft visibility
DROP POLICY IF EXISTS "Everyone can view replies" ON public.discussion_replies;

CREATE POLICY "Everyone can view replies"
  ON public.discussion_replies FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.discussions d
      WHERE d.id = discussion_id
        AND (
          d.is_draft = false
          OR auth.uid() = d.created_by
          OR authorize('discussions.update'::app_permission)
          OR authorize('discussions.manage'::app_permission)
        )
    )
  );

-- 4) Prevent replies to draft discussions at the policy level
DROP POLICY IF EXISTS "Authenticated users can create replies" ON public.discussion_replies;

CREATE POLICY "Authenticated users can create replies"
  ON public.discussion_replies FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM public.discussions d
      WHERE d.id = discussion_id
        AND d.is_draft = false
        AND (d.is_locked = false OR authorize('discussions.update'::app_permission))
    )
  );

-- 5) Enforce draft rules at the database level (including service role)
CREATE OR REPLACE FUNCTION public.enforce_discussion_draft_rules()
RETURNS TRIGGER AS $$
BEGIN
  -- Block turning existing discussions into drafts
  IF TG_OP = 'UPDATE' AND OLD.is_draft = false AND NEW.is_draft = true THEN
    RAISE EXCEPTION 'Discussions cannot be set back to draft once published';
  END IF;

  -- Ensure draft discussions have no replies
  IF NEW.is_draft = true THEN
    IF TG_OP = 'UPDATE' THEN
      IF EXISTS (
        SELECT 1 FROM public.discussion_replies r
        WHERE r.discussion_id = NEW.id
      ) THEN
        RAISE EXCEPTION 'Draft discussions cannot have replies';
      END IF;
    END IF;

    IF NEW.reply_count <> 0 THEN
      RAISE EXCEPTION 'Draft discussions cannot have replies';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_discussion_draft_rules_trigger ON public.discussions;

CREATE TRIGGER enforce_discussion_draft_rules_trigger
  BEFORE INSERT OR UPDATE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_discussion_draft_rules();

CREATE OR REPLACE FUNCTION public.prevent_replies_on_draft_discussion()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.discussions d
    WHERE d.id = NEW.discussion_id
      AND d.is_draft = true
  ) THEN
    RAISE EXCEPTION 'Cannot add replies to draft discussions';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_replies_on_draft_discussion_trigger ON public.discussion_replies;

CREATE TRIGGER prevent_replies_on_draft_discussion_trigger
  BEFORE INSERT OR UPDATE ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_replies_on_draft_discussion();

COMMIT;
