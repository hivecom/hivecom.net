-- Allow any authenticated user to update their own referendums, with the
-- constraint that they cannot set is_public = true and cannot tamper with
-- audit fields (created_at, created_by).
--
-- The existing "Allow authorized roles to UPDATE referendums" policy is NOT
-- dropped - it remains in place so that privileged users (mods/admins) can
-- still update any referendum including flipping is_public = true.
--
-- Policy evaluation: Postgres applies all permissive policies with OR logic,
-- so a privileged user satisfies either policy; a regular user satisfies only
-- this one, which restricts them to their own rows and enforces is_public = false.

CREATE POLICY "Authenticated users can UPDATE their own referendums"
  ON public.referendums
  AS permissive
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
  )
  WITH CHECK (
    created_by = auth.uid()
    AND is_public = false
    AND public.audit_fields_unchanged(created_at, created_by)
  );
