-- Explicit REVOKE on private schema lastfm and badge helper functions.
-- These functions rely only on schema USAGE restriction; this mirrors the
-- explicit revokes applied to the Steam equivalents in
-- 20260516030841_security_revoke_trigger_and_internal_functions.sql.

REVOKE EXECUTE ON FUNCTION private.queue_dispatch_worker_sync_lastfm() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION private.queue_enqueue_worker_sync_lastfm() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION private.remove_profile_badge(p_profile_id uuid, p_slug text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION private.upsert_profile_badge(p_profile_id uuid, p_slug text, p_tier public.badge_tier, p_source public.badge_source, p_progress integer, p_metadata jsonb) FROM anon, authenticated, public;
