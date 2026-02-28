-- Add agreed discussion rules flag to profiles
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "agreed_content_rules" boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "public"."profiles"."agreed_content_rules" IS 'Whether the user has agreed to the discussion rules';
