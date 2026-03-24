-- Fix the stale container DELETE policy to remove the NOT running guard.
-- A stale container (reported_at older than 2 hours) has an unreliable running
-- state by definition - Docker Control lost contact, so the last known running
-- value is frozen. Blocking deletes on running=true silently swallows the
-- operation (PostgREST returns 204 with 0 rows affected) and leaves the admin
-- with no feedback. Staleness alone is sufficient grounds for pruning.

DROP POLICY IF EXISTS "Allow authorized roles to DELETE stale containers" ON "public"."containers";

CREATE POLICY "Allow authorized roles to DELETE stale containers"
  ON "public"."containers"
  AS permissive
  FOR DELETE
  TO authenticated
  USING (
    public.has_permission('containers.delete'::public.app_permission)
    AND reported_at <= (NOW() - '02:00:00'::interval)
  );
