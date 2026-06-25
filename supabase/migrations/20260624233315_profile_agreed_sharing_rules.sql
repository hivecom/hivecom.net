-- Add agreed sharing rules flag to profiles
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "agreed_sharing_rules" boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "public"."profiles"."agreed_sharing_rules" IS 'Whether the user has agreed to the sharing (Orbit Depot upload) rules';
