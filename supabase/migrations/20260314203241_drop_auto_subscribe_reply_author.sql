-- Drop the trigger and function that automatically subscribed a user to a
-- discussion when they posted a reply. Auto-subscribing on reply is unexpected
-- behaviour - subscription should be an explicit opt-in action by the user.
--
-- The auto_subscribe_discussion_author trigger (fires on discussion INSERT) is
-- intentionally left in place: subscribing the original author to their own
-- discussion is reasonable.

BEGIN;

DROP TRIGGER IF EXISTS auto_subscribe_reply_author_trigger ON public.discussion_replies;
DROP FUNCTION IF EXISTS public.auto_subscribe_reply_author();

COMMIT;
