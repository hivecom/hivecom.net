-- Add trigger to scrub reply content and authors when soft-deleted.
--
-- When a discussion reply is soft-deleted (is_deleted flips to true),
-- clear markdown and user attribution fields so content does not linger
-- and authorship is no longer displayed.

CREATE OR REPLACE FUNCTION public.scrub_discussion_reply_on_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Only act when a reply transitions from not-deleted to deleted.
  IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
    NEW.markdown := '';
    NEW.created_by := NULL;
    NEW.modified_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scrub_discussion_reply_on_soft_delete_trigger ON public.discussion_replies;

CREATE TRIGGER scrub_discussion_reply_on_soft_delete_trigger
  BEFORE UPDATE OF is_deleted ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.scrub_discussion_reply_on_soft_delete();

GRANT EXECUTE ON FUNCTION public.scrub_discussion_reply_on_soft_delete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.scrub_discussion_reply_on_soft_delete() TO service_role;
