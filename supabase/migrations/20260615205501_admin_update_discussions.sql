-- Allow admins/mods to UPDATE any discussion (lock, archive, etc.).
CREATE POLICY "Authorized users can UPDATE discussions"
  ON public.discussions
  FOR UPDATE TO authenticated
  USING (
    has_permission('discussions.update'::app_permission)
    AND is_not_banned()
    AND is_aal2_if_mfa()
  );
