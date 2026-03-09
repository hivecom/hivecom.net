-- Inherit NSFW flag from parent discussion onto replies
--
-- When a reply is inserted into a discussion that is marked is_nsfw = true,
-- the reply automatically inherits is_nsfw = true regardless of what the
-- client sent. This ensures all content within an NSFW discussion is
-- consistently flagged.

CREATE OR REPLACE FUNCTION public.inherit_discussion_nsfw_on_reply_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.discussions d
    WHERE d.id = NEW.discussion_id
      AND d.is_nsfw = true
  ) THEN
    NEW.is_nsfw := true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER inherit_discussion_nsfw_on_reply_insert_trigger
  BEFORE INSERT ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_discussion_nsfw_on_reply_insert();

-- When a discussion is toggled to NSFW, cascade to all existing replies.
-- When toggled back to non-NSFW, replies keep their individual flags
-- (a reply may have been independently marked NSFW by its author).

CREATE OR REPLACE FUNCTION public.cascade_discussion_nsfw_to_replies()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_nsfw IS NOT DISTINCT FROM NEW.is_nsfw THEN
    RETURN NEW;
  END IF;

  -- Only cascade when the discussion becomes NSFW
  IF NEW.is_nsfw = true THEN
    UPDATE public.discussion_replies
    SET is_nsfw = true
    WHERE discussion_id = NEW.id
      AND is_nsfw = false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER cascade_discussion_nsfw_to_replies_trigger
  AFTER UPDATE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_discussion_nsfw_to_replies();
