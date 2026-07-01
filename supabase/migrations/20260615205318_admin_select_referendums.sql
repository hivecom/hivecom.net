-- Allow admins/mods to SELECT all referendums regardless of date_start.
-- Without this, direct client operations (e.g. delete) fail on referendums
-- that haven't started yet because PostgREST requires the row to be visible
-- via SELECT before it can be deleted.
CREATE POLICY "Authorized users can SELECT all referendums"
  ON public.referendums
  FOR SELECT TO authenticated
  USING (has_permission('referendums.read'::app_permission));
