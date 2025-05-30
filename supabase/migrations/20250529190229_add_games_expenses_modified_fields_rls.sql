-- Add specific UPDATE policies that prevent modification of created_at and created_by fields
CREATE POLICY "Restrict modification of audit fields for games" ON "public"."games" AS restrictive
  FOR UPDATE TO authenticated
    WITH CHECK ((NOT (created_at IS DISTINCT FROM created_at))
    AND (NOT (created_by IS DISTINCT FROM created_by)));

CREATE POLICY "Restrict modification of audit fields for expenses" ON "public"."expenses" AS restrictive
  FOR UPDATE TO authenticated
    WITH CHECK ((NOT (created_at IS DISTINCT FROM created_at))
    AND (NOT (created_by IS DISTINCT FROM created_by)));

