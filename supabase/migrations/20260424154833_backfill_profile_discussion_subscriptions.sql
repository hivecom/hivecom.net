-- Backfill discussion_subscriptions for profile discussions.
--
-- The auto_subscribe_discussion_author trigger already subscribes profile owners
-- when their profile discussion is created (profiles.id = discussions.created_by
-- for profile-linked discussions). This migration covers existing profiles that
-- predate the subscription system or were seeded without triggering that path.

INSERT INTO public.discussion_subscriptions (user_id, discussion_id)
SELECT p.id, d.id
FROM public.profiles p
JOIN public.discussions d ON d.profile_id = p.id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.discussion_subscriptions ds
  WHERE ds.user_id = p.id
    AND ds.discussion_id = d.id
);
