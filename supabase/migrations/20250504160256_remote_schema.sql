CREATE POLICY "Allow authorized roles to DELETE stale containers" ON "public"."containers" AS permissive
  FOR DELETE TO authenticated
    USING (((
      SELECT
        authorize('containers.crud'::app_permission) AS authorize) AND (NOT running) AND (reported_at <=(NOW() - '02:00:00'::interval))));

