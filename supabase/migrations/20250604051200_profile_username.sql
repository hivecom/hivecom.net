-- Update username constraint to only allow letters, numbers, and underscores
-- Drop the existing constraint
ALTER TABLE "public"."profiles"
  DROP CONSTRAINT "username_valid_chars";

-- Add the new constraint with only letters, numbers, and underscores
ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "username_valid_chars" CHECK ((username ~ '^[a-zA-Z0-9_]+$'::text)) NOT valid;

-- Validate the new constraint
ALTER TABLE "public"."profiles" validate CONSTRAINT "username_valid_chars";

