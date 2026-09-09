-- Restore the DELETE grant on network_containers for authenticated.
--
-- Pruning a stale container from the admin network table fails with
-- 42501 "permission denied for table network_containers", even for admins.
-- The RLS policy is fine - "Allow authorized roles to DELETE stale containers"
-- is still there and still gates on network.delete plus a 2 hour staleness
-- window. The problem is one level up: the table grant.
--
-- Prod ACL on network_containers reads authenticated=r, so SELECT only.
-- Compare network_gameservers and network_servers, which both read
-- authenticated=arwd. Grants are checked before RLS, so the delete never gets
-- far enough for the policy to matter.
--
-- 20250418010533 granted DELETE on the old `containers` table and nothing in
-- the migration history takes it away, so this was revoked out of band.

GRANT DELETE ON TABLE public.network_containers TO authenticated;
