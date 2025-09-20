-- Add last_seen column to profiles table
ALTER TABLE "public"."profiles"
  ADD COLUMN "last_seen" timestamp with time zone DEFAULT NOW();

-- Set default last_seen to created_at for existing users
UPDATE
  "public"."profiles"
SET
  "last_seen" = "created_at"
WHERE
  "last_seen" IS NULL;

-- Make the column NOT NULL after setting defaults
ALTER TABLE "public"."profiles"
  ALTER COLUMN "last_seen" SET NOT NULL;

-- Create function to update last_seen from auth.users.last_sign_in_at
CREATE OR REPLACE FUNCTION "public"."update_last_seen_on_sign_in"()
  RETURNS TRIGGER
  AS $$
BEGIN
  -- Only update if last_sign_in_at has actually changed and is within reasonable bounds
  IF(OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at AND NEW.last_sign_in_at IS NOT NULL AND NEW.last_sign_in_at >=(NOW() AT TIME ZONE 'UTC' - interval '1 hour') AND NEW.last_sign_in_at <=(NOW() AT TIME ZONE 'UTC')) THEN
    UPDATE
      "public"."profiles"
    SET
      "last_seen" = NEW.last_sign_in_at
    WHERE
      "id" = NEW.id::uuid;
  END IF;
  RETURN NEW;
END;
$$
LANGUAGE plpgsql
SECURITY DEFINER;

-- Create trigger to automatically update last_seen on sign in
CREATE TRIGGER "on_auth_user_sign_in"
  AFTER UPDATE ON "auth"."users"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."update_last_seen_on_sign_in"();

-- Create function to manually update last_seen (for app activity tracking)
CREATE OR REPLACE FUNCTION "public"."update_user_last_seen"(user_id uuid DEFAULT auth.uid())
  RETURNS void
  AS $$
DECLARE
  CURRENT_TIME timestamp with time zone := NOW() AT TIME ZONE 'UTC';
  min_allowed_time timestamp with time zone := NOW() AT TIME ZONE 'UTC' - interval '1 hour';
  max_allowed_time timestamp with time zone := NOW() AT TIME ZONE 'UTC';
BEGIN
  -- Only update if the current time is within reasonable bounds
  -- This provides an extra layer of protection beyond the table constraints
  IF CURRENT_TIME >= min_allowed_time AND CURRENT_TIME <= max_allowed_time THEN
    UPDATE
      "public"."profiles"
    SET
      "last_seen" = CURRENT_TIME
    WHERE
      "id" = user_id;
  ELSE
    RAISE WARNING 'Attempted to set last_seen to invalid timestamp: % (must be between % and %)', CURRENT_TIME, min_allowed_time, max_allowed_time;
  END IF;
END;
$$
LANGUAGE plpgsql
SECURITY DEFINER;

-- Grant execute permission to authenticated users for the manual update function
GRANT EXECUTE ON FUNCTION "public"."update_user_last_seen"(uuid) TO authenticated;

-- Add index for efficient last_seen queries
CREATE INDEX IF NOT EXISTS "idx_profiles_last_seen" ON "public"."profiles"("last_seen");

-- Add constraints to ensure last_seen is within reasonable bounds
ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "chk_last_seen_not_future" CHECK ("last_seen" <=(NOW() AT TIME ZONE 'UTC')),
  ADD CONSTRAINT "chk_last_seen_not_past" CHECK ("last_seen" >=(NOW() AT TIME ZONE 'UTC' - interval '1 hour'));

-- Add comment to document the column
COMMENT ON COLUMN "public"."profiles"."last_seen" IS 'Timestamp of when the user was last seen/active. Updated on sign-in and can be manually updated for activity tracking. Must not be in the future and not more than 1 hour in the past to account for processing delays.';

