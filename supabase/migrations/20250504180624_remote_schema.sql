DROP POLICY IF EXISTS "Allow authorized roles to DELETE stale containers" ON "public"."containers";

ALTER TABLE "public"."containers"
  ALTER COLUMN "reported_at" SET data TYPE timestamp with time zone USING "reported_at"::timestamp with time zone;

CREATE POLICY "Allow authorized roles to DELETE stale containers" ON "public"."containers" AS permissive
  FOR DELETE TO authenticated
    USING (((
      SELECT
        authorize('containers.crud'::app_permission) AS authorize) AND (NOT running) AND (reported_at <=(NOW() - '02:00:00'::interval))));

