-- Add granular CMS asset permissions to the RBAC enum.
-- This migration only appends new enum values so later migrations can reference them safely.
DO $$
BEGIN
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_enum
    WHERE
      enumlabel = 'assets.create'
      AND enumtypid = 'public.app_permission'::regtype) THEN
  ALTER TYPE "public"."app_permission"
    ADD VALUE 'assets.create';
END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_enum
    WHERE
      enumlabel = 'assets.delete'
      AND enumtypid = 'public.app_permission'::regtype) THEN
  ALTER TYPE "public"."app_permission"
    ADD VALUE 'assets.delete';
END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_enum
    WHERE
      enumlabel = 'assets.read'
      AND enumtypid = 'public.app_permission'::regtype) THEN
  ALTER TYPE "public"."app_permission"
    ADD VALUE 'assets.read';
END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_enum
    WHERE
      enumlabel = 'assets.update'
      AND enumtypid = 'public.app_permission'::regtype) THEN
  ALTER TYPE "public"."app_permission"
    ADD VALUE 'assets.update';
END IF;
END
$$;

-- Grant CMS asset permissions to admin and moderator roles
