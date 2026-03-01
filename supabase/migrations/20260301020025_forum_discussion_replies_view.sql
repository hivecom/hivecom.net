-- Create a view that scopes discussion_replies to forum discussions only
-- (i.e. replies whose parent discussion belongs to a discussion_topic).
--
-- This avoids fetching replies to profile/event/referendum/etc. discussions
-- when building the forum activity feed, instead of filtering them out
-- client-side after the fact.
--
-- RLS from the underlying discussion_replies table is enforced via
-- security_invoker, so no separate policies are needed on the view.

CREATE VIEW public.forum_discussion_replies
  WITH (security_invoker = true)
AS
SELECT dr.*
FROM public.discussion_replies dr
INNER JOIN public.discussions d ON d.id = dr.discussion_id
WHERE d.discussion_topic_id IS NOT NULL;

COMMENT ON VIEW public.forum_discussion_replies IS
  'discussion_replies scoped to forum discussions (discussion_topic_id IS NOT NULL). '
  'RLS is inherited from the underlying discussion_replies table.';

GRANT SELECT ON public.forum_discussion_replies TO anon;
GRANT SELECT ON public.forum_discussion_replies TO authenticated;
GRANT SELECT ON public.forum_discussion_replies TO service_role;
