-- RLS performance improvements:
--
-- 1. is_not_banned(): use (SELECT auth.uid()) subquery so auth.uid() is
--    evaluated once per statement rather than once per row.
--
-- 2. profiles SELECT policy "Allow authenticated to SELECT profiles":
--    qual was `has_permission(...) OR has_permission(...) OR is_profile_owner(id) OR true`
--    The OR true makes every preceding call dead work - evaluated per row for nothing.
--    Replaced with USING (true).
--
-- 3. user_roles SELECT policy "Allow authorized roles to SELECT user roles":
--    qual was `has_permission('roles.read') OR true` - same problem.
--    Replaced with USING (true).
--
-- 4. discussions SELECT policy "Everyone can view discussions":
--    authorize() was the first condition, called per row for every user including
--    non-admins who never satisfy it. Reordered so cheap short-circuit checks
--    (is_draft = false, auth.uid() checks) run first; authorize() only reached
--    when the user is authenticated and the discussion is a draft.
--
-- 5. discussion_replies SELECT policy "Everyone can view replies":
--    authorize() was inside a correlated subquery on discussions, called per row.
--    Reordered so is_draft = false check runs first; authorize() only reached
--    for draft discussions where the viewer is not the author.

-- ─── 1. is_not_banned ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_not_banned()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND banned = true
      AND (ban_end IS NULL OR ban_end > now())
  );
$$;

-- ─── 2. profiles SELECT ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authenticated to SELECT profiles" ON public.profiles;

CREATE POLICY "Allow authenticated to SELECT profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- ─── 3. user_roles SELECT ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to SELECT user roles" ON public.user_roles;

CREATE POLICY "Allow authorized roles to SELECT user roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (true);

-- ─── 4. discussions SELECT ────────────────────────────────────────────────────
-- Old: authorize(...) OR (auth.uid() = created_by) OR (auth.uid() IS NOT NULL AND is_draft = false) OR (is_draft = false AND is_nsfw = false)
-- New: cheap checks first; authorize() only evaluated for authenticated users on draft discussions

DROP POLICY IF EXISTS "Everyone can view discussions" ON public.discussions;

CREATE POLICY "Everyone can view discussions"
  ON public.discussions
  FOR SELECT
  TO public
  USING (
    -- Public non-draft non-nsfw: fastest path, no auth calls
    (is_draft = false AND is_nsfw = false)
    -- Authenticated viewing any non-draft
    OR (auth.uid() IS NOT NULL AND is_draft = false)
    -- Owner can always see their own
    OR (auth.uid() = created_by)
    -- Admins can see drafts too (authorize last - most expensive)
    OR authorize('discussions.update'::app_permission)
  );

-- ─── 5. discussion_replies SELECT ─────────────────────────────────────────────
-- Old: EXISTS (SELECT 1 FROM discussions d WHERE d.id = discussion_id AND (d.is_draft = false OR auth.uid() = d.created_by OR authorize(...)))
-- New: is_draft = false check first; authorize() only reached for draft discussions where viewer is not author

DROP POLICY IF EXISTS "Everyone can view replies" ON public.discussion_replies;

CREATE POLICY "Everyone can view replies"
  ON public.discussion_replies
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM discussions d
      WHERE d.id = discussion_replies.discussion_id
        AND (
          d.is_draft = false
          OR (auth.uid() IS NOT NULL AND auth.uid() = d.created_by)
          OR authorize('discussions.update'::app_permission)
        )
    )
  );
