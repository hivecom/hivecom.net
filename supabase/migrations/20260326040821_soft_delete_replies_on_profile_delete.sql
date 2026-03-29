-- When a profile is deleted, soft-delete all of their discussion replies rather
-- than leaving them as orphaned rows with a nulled created_by.
--
-- This fires BEFORE DELETE on profiles so that OLD.id is still available to
-- match against discussion_replies.created_by before the ON DELETE SET NULL
-- cascade nulls it out.

CREATE OR REPLACE FUNCTION public.soft_delete_replies_on_profile_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.discussion_replies
  SET is_deleted = true,
      markdown = ''
  WHERE created_by = OLD.id
    AND is_deleted = false;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS soft_delete_replies_on_profile_delete_trigger ON public.profiles;

CREATE TRIGGER soft_delete_replies_on_profile_delete_trigger
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.soft_delete_replies_on_profile_delete();

GRANT EXECUTE ON FUNCTION public.soft_delete_replies_on_profile_delete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_replies_on_profile_delete() TO service_role;
