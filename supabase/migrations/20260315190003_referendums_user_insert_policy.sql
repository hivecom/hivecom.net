-- Allow any authenticated user to create a referendum, with the constraint that
-- they cannot set is_public = true (only users with referendums.update permission
-- can do that via the existing UPDATE policy) and that created_by must be their
-- own user ID so they can't impersonate others.
--
-- The existing "Allow authorized roles to INSERT referendums" policy is NOT
-- dropped - it remains in place so that privileged users (mods/admins) can still
-- insert with is_public = true if they choose to do so at insert time.
--
-- Policy evaluation: Postgres applies all permissive policies with OR logic, so
-- a privileged user satisfies either policy; a regular user satisfies only this
-- one, which enforces is_public = false.

CREATE POLICY "Authenticated users can INSERT private referendums"
  ON public.referendums
  AS permissive
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_public = false
    AND created_by = auth.uid()
  );
