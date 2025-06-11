-- Enforce single role per user constraint
-- This prevents users from having multiple roles which would cause issues with JWT token generation
-- First, we need to handle any existing users with multiple roles
-- Find users with multiple roles and keep only the highest priority role (admin > moderator)
DO $$
DECLARE
  user_record RECORD;
BEGIN
  -- For each user who has multiple roles, keep only the highest priority role
  FOR user_record IN
  SELECT
    user_id,
    COUNT(*) AS role_count
  FROM
    public.user_roles
  GROUP BY
    user_id
  HAVING
    COUNT(*) > 1 LOOP
    -- Delete all roles for this user except the highest priority one
    -- Priority: admin > moderator
    DELETE FROM public.user_roles
    WHERE user_id = user_record.user_id
      AND id NOT IN (
        SELECT
          id
        FROM
          public.user_roles
        WHERE
          user_id = user_record.user_id
        ORDER BY
          CASE WHEN ROLE = 'admin' THEN
            1
          WHEN ROLE = 'moderator' THEN
            2
          ELSE
            3
          END
        LIMIT 1);
    RAISE NOTICE 'Cleaned up multiple roles for user: %', user_record.user_id;
  END LOOP;
END
$$;

-- Add unique constraint to ensure only one role per user
ALTER TABLE "public"."user_roles"
  ADD CONSTRAINT "user_roles_user_id_unique" UNIQUE ("user_id");

-- Update the constraint comment
COMMENT ON CONSTRAINT "user_roles_user_id_unique" ON "public"."user_roles" IS 'Ensures each user can only have one role to maintain JWT token consistency';

