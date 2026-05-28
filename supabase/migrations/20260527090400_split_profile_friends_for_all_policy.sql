-- Split FOR ALL "Users can manage own friend relationships" into explicit INSERT + UPDATE
-- SELECT and DELETE policies remain unchanged

DROP POLICY "Users can manage own friend relationships" ON profile_friends;

CREATE POLICY "Users can INSERT own friend relationships"
  ON profile_friends
  FOR INSERT
  TO public
  WITH CHECK (
    friender = (SELECT auth.uid()) AND is_not_banned() AND is_aal2_if_mfa()
  );

CREATE POLICY "Users can UPDATE own friend relationships"
  ON profile_friends
  FOR UPDATE
  TO public
  USING (
    friender = (SELECT auth.uid()) AND is_not_banned() AND is_aal2_if_mfa()
  )
  WITH CHECK (
    friender = (SELECT auth.uid()) AND is_not_banned() AND is_aal2_if_mfa()
  );
