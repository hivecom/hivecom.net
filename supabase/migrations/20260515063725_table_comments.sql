-- Table and view comments for documentation and Supabase Studio display.

COMMENT ON TABLE public.profile_point_claims IS
  'Pending point awards for unmatched Ko-fi donations. Keyed by donor email. '
  'Users claim all pending rows via the claim_profile_points() RPC once logged in.';

COMMENT ON TABLE public.settings IS
  'Per-user application settings stored as a JSON blob. One row per user, '
  'keyed by the user''s profile id.';

COMMENT ON TABLE public.themes IS
  'Community and system UI themes. System themes have created_by = NULL and '
  'is_official = true. Users can create, fork, and share custom themes.';

COMMENT ON MATERIALIZED VIEW public.theme_usage IS
  'Aggregated count of profiles using each theme. Refreshed periodically. '
  'Used for theme popularity display in the admin panel and theme browser.';
