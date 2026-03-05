-- Create settings table for per-user settings storage
CREATE TABLE "public"."settings"(
  "id" uuid NOT NULL DEFAULT auth.uid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
  "modified_at" timestamp with time zone,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Enable RLS on settings table
ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;

-- Create primary key for settings (one row per user)
CREATE UNIQUE INDEX settings_pkey ON public.settings USING btree(id);

ALTER TABLE "public"."settings"
  ADD CONSTRAINT "settings_pkey" PRIMARY KEY USING INDEX "settings_pkey";

-- Add foreign key constraint linking to auth.users
ALTER TABLE "public"."settings"
  ADD CONSTRAINT "settings_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;

ALTER TABLE "public"."settings" VALIDATE CONSTRAINT "settings_id_fkey";

-- Grant permissions on settings table
GRANT DELETE ON TABLE "public"."settings" TO "anon";
GRANT INSERT ON TABLE "public"."settings" TO "anon";
GRANT REFERENCES ON TABLE "public"."settings" TO "anon";
GRANT SELECT ON TABLE "public"."settings" TO "anon";
GRANT TRIGGER ON TABLE "public"."settings" TO "anon";
GRANT TRUNCATE ON TABLE "public"."settings" TO "anon";
GRANT UPDATE ON TABLE "public"."settings" TO "anon";

GRANT DELETE ON TABLE "public"."settings" TO "authenticated";
GRANT INSERT ON TABLE "public"."settings" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."settings" TO "authenticated";
GRANT SELECT ON TABLE "public"."settings" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."settings" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."settings" TO "authenticated";
GRANT UPDATE ON TABLE "public"."settings" TO "authenticated";

GRANT DELETE ON TABLE "public"."settings" TO "service_role";
GRANT INSERT ON TABLE "public"."settings" TO "service_role";
GRANT REFERENCES ON TABLE "public"."settings" TO "service_role";
GRANT SELECT ON TABLE "public"."settings" TO "service_role";
GRANT TRIGGER ON TABLE "public"."settings" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."settings" TO "service_role";
GRANT UPDATE ON TABLE "public"."settings" TO "service_role";

-- RLS policies: only the owning user can read/write their own settings row

-- Users can read their own settings
CREATE POLICY "Users can read own settings" ON "public"."settings"
  FOR SELECT TO authenticated
    USING (public.is_owner(id));

-- Users can insert their own settings row
CREATE POLICY "Users can insert own settings" ON "public"."settings"
  FOR INSERT TO authenticated
    WITH CHECK (public.is_owner(id));

-- Users can update their own settings
CREATE POLICY "Users can update own settings" ON "public"."settings"
  FOR UPDATE TO authenticated
    USING (public.is_owner(id));

-- Users can delete their own settings
CREATE POLICY "Users can delete own settings" ON "public"."settings"
  FOR DELETE TO authenticated
    USING (public.is_owner(id));

-- Add audit field trigger for automatic modified_at updates
DROP TRIGGER IF EXISTS update_settings_audit_fields ON public.settings;

CREATE TRIGGER update_settings_audit_fields
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();
