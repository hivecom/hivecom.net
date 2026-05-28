-- Migration: fix_get_admin_users_paginated_regrant_authenticated
--
-- Migration 20260526163000_admin_users_paginated_lastfm revoked EXECUTE from
-- both anon and authenticated with no subsequent re-grant to authenticated.
-- This broke the admin dashboard. Re-grant here.

GRANT EXECUTE ON FUNCTION public.get_admin_users_paginated(
  text, text, text, text, text, text, text, text, text, integer, integer
) TO authenticated;
