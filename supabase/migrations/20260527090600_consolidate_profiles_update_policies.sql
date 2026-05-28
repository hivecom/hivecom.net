-- Consolidate 3 overlapping UPDATE policies on profiles into one canonical policy
-- admin/moderator branch: has_permission('users.update') subsumes the ban-management policy
-- owner branch: preserves all immutability guards (incl. teamspeak_identities, has_banner,
--   banner_extension from policy 3 that were absent from policy 2)
-- auth.uid() calls wrapped in (SELECT ...) for initplan performance

DROP POLICY "Allow admins to manage user bans" ON profiles;
DROP POLICY "Allow authorized roles to UPDATE profiles" ON profiles;
DROP POLICY "Users can UPDATE their information on their profiles" ON profiles;

CREATE POLICY "Users can UPDATE profiles"
  ON profiles
  FOR UPDATE
  TO public
  USING (
    has_permission('profiles.update'::app_permission)
    OR ((SELECT auth.uid()) = id AND is_not_banned() AND is_aal2_if_mfa())
  )
  WITH CHECK (
    (
      -- Admin / moderator branch
      has_permission('users.update'::app_permission)
      AND audit_fields_unchanged(created_at, NULL::uuid)
    )
    OR (
      -- Owner branch
      (SELECT auth.uid()) = id
      AND is_not_banned()
      AND is_aal2_if_mfa()
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
      )
      AND audit_fields_unchanged(created_at, NULL::uuid)
      -- Preserve immutability intent for linked-account and ban fields (enforced by triggers)
      AND (NOT (discord_id IS DISTINCT FROM discord_id))
      AND (NOT (patreon_id IS DISTINCT FROM patreon_id))
      AND (NOT (supporter_patreon IS DISTINCT FROM supporter_patreon))
      AND (NOT (supporter_lifetime IS DISTINCT FROM supporter_lifetime))
      AND (NOT (steam_id IS DISTINCT FROM steam_id))
      AND (NOT (lastfm_username IS DISTINCT FROM lastfm_username))
      AND (NOT (banned IS DISTINCT FROM banned))
      AND (NOT (ban_reason IS DISTINCT FROM ban_reason))
      AND (NOT (ban_start IS DISTINCT FROM ban_start))
      AND (NOT (ban_end IS DISTINCT FROM ban_end))
      -- Additional fields from policy 3 not previously in policy 2
      AND (NOT (teamspeak_identities IS DISTINCT FROM teamspeak_identities))
      AND (NOT (has_banner IS DISTINCT FROM has_banner))
      AND (NOT (banner_extension IS DISTINCT FROM banner_extension))
    )
  );
