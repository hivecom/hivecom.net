-- Drop the UPDATE policy that references created_by
DROP POLICY "Allow authorized roles to UPDATE kvstore" ON "public"."kvstore";

-- Drop created_by - not used anywhere, caused seeding issues, no semantic value
ALTER TABLE "public"."kvstore" DROP COLUMN "created_by";

-- Make modified_by nullable - populated by audit trigger on authenticated updates
ALTER TABLE "public"."kvstore" ALTER COLUMN "modified_by" DROP NOT NULL;

-- Recreate UPDATE policy without created_by check (created_at still protected by audit trigger)
CREATE POLICY "Allow authorized roles to UPDATE kvstore" ON "public"."kvstore"
  FOR UPDATE TO authenticated
    USING (public.has_permission('kvstore.update'::public.app_permission))
    WITH CHECK (public.has_permission('kvstore.update'::public.app_permission));

-- Add audit trigger to kvstore (drop first to be idempotent)
DROP TRIGGER IF EXISTS update_kvstore_audit_fields ON public.kvstore;

CREATE TRIGGER update_kvstore_audit_fields
  BEFORE UPDATE ON public.kvstore
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();
