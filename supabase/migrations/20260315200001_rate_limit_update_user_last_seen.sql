-- Add a 60-second rate-limiting guard to update_user_last_seen.
-- Previously the function did an unconditional UPDATE on every call, generating
-- dead tuple churn under MVCC when clients call it on every page navigation.
-- The WHERE clause now short-circuits if last_seen was updated within the last 60 seconds,
-- making rapid calls a no-op at the DB level.

DROP FUNCTION IF EXISTS "public"."update_user_last_seen"(uuid);

CREATE OR REPLACE FUNCTION "public"."update_user_last_seen"(user_id uuid DEFAULT auth.uid())
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  UPDATE "public"."profiles"
  SET "last_seen" = NOW()
  WHERE
    "id" = user_id
    AND (
      "last_seen" IS NULL
      OR "last_seen" < NOW() - INTERVAL '60 seconds'
    );
END;
$$;

-- Re-grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION "public"."update_user_last_seen"(uuid) TO authenticated;
