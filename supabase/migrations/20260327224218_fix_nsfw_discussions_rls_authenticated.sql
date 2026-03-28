-- Fix NSFW discussions RLS: authenticated users can read NSFW discussions.
--
-- Problem:
--   The "Everyone can view discussions" policy (introduced in
--   20260308221700_discussions_nsfw_rls.sql and re-created in
--   20260326024806_fix_discussions_rls_authorize_qualification.sql) only allows
--   NSFW discussions to be read by admins/moderators or the post author.
--   All other authenticated users receive no rows, which the frontend treats as
--   "Discussion not found" and redirects them away.
--
-- Root cause:
--   The intent of the NSFW RLS was to hide NSFW content from unauthenticated
--   (anon) visitors. The implementation accidentally extended that restriction to
--   all non-privileged authenticated users as well.
--
--   The show_nsfw_content user setting is a client-side preference that controls
--   whether the warning overlay appears and whether NSFW posts appear in feeds
--   and listings. It is not an access-control mechanism. Hiding the row at the
--   DB layer for authenticated users breaks direct URL navigation and is
--   inconsistent with how the rest of the content model works.
--
-- Fix:
--   Extend the SELECT policy so that any authenticated user can read NSFW
--   discussions. Unauthenticated (anon) visitors are still blocked from NSFW
--   content. Drafts remain restricted to their author and privileged users.
--
-- Updated truth table:
--
--   is_draft | is_nsfw | auth state      | visible?
--   ---------+---------+-----------------+------------------------------------------
--   false    | false   | anon            | yes  (public non-NSFW post)
--   false    | false   | authenticated   | yes  (public non-NSFW post)
--   false    | true    | anon            | no   (NSFW hidden from unauthenticated)
--   false    | true    | authenticated   | yes  (UI handles overlay / feed filtering)
--   true     | any     | anon            | no   (drafts always hidden from public)
--   true     | any     | authenticated,
--                        non-author/mod  | no   (drafts hidden from others)
--   true     | any     | author or mod   | yes  (can always see own/all drafts)

DROP POLICY IF EXISTS "Everyone can view discussions" ON public.discussions;

CREATE POLICY "Everyone can view discussions"
  ON public.discussions FOR SELECT
  USING (
    -- Admins and moderators can always see everything (drafts, NSFW, etc.)
    public.authorize('discussions.update'::public.app_permission)
    -- Authors can always see their own discussions regardless of state
    OR auth.uid() = created_by
    -- Authenticated users can see any published discussion, including NSFW
    -- (the UI handles warning overlays and feed-level filtering via user settings)
    OR (auth.uid() IS NOT NULL AND is_draft = false)
    -- Unauthenticated visitors can only see non-draft, non-NSFW discussions
    OR (is_draft = false AND is_nsfw = false)
  );
