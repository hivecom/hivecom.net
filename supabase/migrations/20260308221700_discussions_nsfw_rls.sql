-- Exclude NSFW discussions from public read access.
--
-- Previously the "Everyone can view discussions" policy allowed anyone to
-- SELECT any non-draft discussion. This migration tightens that: discussions
-- marked is_nsfw = true are only visible to their author and users with the
-- discussions.update permission (admins / moderators).
--
-- NSFW replies are intentionally unaffected - reply visibility is already
-- gated on the parent discussion being readable, so if the discussion is
-- hidden the replies are implicitly hidden too. Standalone NSFW reply
-- filtering (e.g. for replies in non-NSFW discussions) is left to the
-- application layer.
--
-- Truth table for the USING clause:
--
--   is_draft | is_nsfw | is author/mod | visible?
--   ---------+---------+---------------+---------
--   false    | false   | any           | yes   (public non-NSFW post)
--   false    | true    | no            | no    (NSFW hidden from public)
--   false    | true    | yes           | yes   (author/mod can see their NSFW)
--   true     | any     | no            | no    (drafts hidden from public)
--   true     | any     | yes           | yes   (author/mod can see drafts)

DROP POLICY IF EXISTS "Everyone can view discussions" ON public.discussions;

CREATE POLICY "Everyone can view discussions"
  ON public.discussions FOR SELECT
  USING (
    -- Admins and moderators can always see everything (drafts, NSFW, etc.)
    authorize('discussions.update'::public.app_permission)
    -- Authors can always see their own discussions regardless of state
    OR auth.uid() = created_by
    -- Everyone else can only see non-draft, non-NSFW discussions
    OR (is_draft = false AND is_nsfw = false)
  );
