-- Prevent users from editing their own replies when the parent discussion is locked.
--
-- The INSERT policy already blocks new replies on locked discussions for non-privileged
-- users (see "Authenticated users can create replies"), but the UPDATE policy
-- "Users can update their own replies" never checked is_locked, meaning a user
-- could bypass the frontend guard and directly patch their reply via the API.
--
-- The "Allow authorized can update any reply" policy (requires discussions.update
-- permission) is intentionally left unchanged: admins and moderators can bypass
-- the lock for both new replies and edits, consistent with the INSERT policy.

DROP POLICY IF EXISTS "Users can update their own replies" ON public.discussion_replies;
CREATE POLICY "Users can update their own replies"
  ON public.discussion_replies FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
    AND EXISTS (
      SELECT 1
      FROM public.discussions d
      WHERE d.id = discussion_id
        AND d.is_locked = false
    )
  );
