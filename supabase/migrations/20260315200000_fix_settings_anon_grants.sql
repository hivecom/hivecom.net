-- Revoke overly broad privileges granted to anon on the settings table.
-- RLS policies already restrict anon to zero rows (all policies are TO authenticated),
-- but granting DELETE/INSERT/UPDATE/TRUNCATE/TRIGGER/REFERENCES to anon is unnecessarily
-- permissive and will flag in security audits.
-- Anon retains SELECT only (conventional - no rows are visible due to RLS anyway).

REVOKE DELETE ON TABLE "public"."settings" FROM "anon";
REVOKE INSERT ON TABLE "public"."settings" FROM "anon";
REVOKE REFERENCES ON TABLE "public"."settings" FROM "anon";
REVOKE TRIGGER ON TABLE "public"."settings" FROM "anon";
REVOKE TRUNCATE ON TABLE "public"."settings" FROM "anon";
REVOKE UPDATE ON TABLE "public"."settings" FROM "anon";

-- SELECT is kept: anon can attempt reads, RLS will return zero rows.
-- No change to authenticated or service_role grants.
