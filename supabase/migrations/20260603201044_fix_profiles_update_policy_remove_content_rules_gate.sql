-- Fix profiles self-update deadlock introduced by 20260527090600_consolidate_profiles_update_policies.
--
-- That migration added an `agreed_content_rules = true` requirement to the OWNER branch of the
-- profiles UPDATE policy. This is a deadlock for any user whose flag is still the default FALSE:
--   - they cannot set their username (onboarding / auth confirm flow), and
--   - they cannot agree to the content rules, because ContentRulesModal.vue sets
--     `agreed_content_rules = true` via a plain profiles UPDATE which the same WITH CHECK blocks.
--
-- The content-rules gate belongs on content CREATION (discussions, replies, projects), which already
-- enforce it independently. Editing your own profile must not be gated on it. This recreates the
-- canonical policy with the owner-branch `agreed_content_rules` EXISTS clause removed; all other
-- guards (ban, AAL2, audit/immutable-field guards, admin branch) are preserved unchanged.

DROP POLICY "Users can UPDATE profiles" ON profiles;

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
      AND (NOT (teamspeak_identities IS DISTINCT FROM teamspeak_identities))
      AND (NOT (has_banner IS DISTINCT FROM has_banner))
      AND (NOT (banner_extension IS DISTINCT FROM banner_extension))
    )
  );
