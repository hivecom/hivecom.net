-- Drop duplicate unique constraints that are redundant with primary keys
-- These constraints create duplicate indexes on the same columns as the primary keys
-- Drop events_id_key constraint (keep events_pkey)
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_constraint
    WHERE
      conname = 'events_id_key'
      AND connamespace =(
        SELECT
          oid
        FROM
          pg_namespace
        WHERE
          nspname = 'public')) THEN
    ALTER TABLE "public"."events"
      DROP CONSTRAINT "events_id_key";
END IF;
END
$$;

-- Drop monthly_funding_month_key constraint (keep monthly_funding_pkey)
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_constraint
    WHERE
      conname = 'monthly_funding_month_key'
      AND connamespace =(
        SELECT
          oid
        FROM
          pg_namespace
        WHERE
          nspname = 'public')) THEN
    ALTER TABLE "public"."monthly_funding"
      DROP CONSTRAINT "monthly_funding_month_key";
END IF;
END
$$;

-- Drop referendum_votes_id_key constraint (keep referendum_votes_pkey)
DO $$
BEGIN
  IF EXISTS(
    SELECT
      1
    FROM
      pg_constraint
    WHERE
      conname = 'referendum_votes_id_key'
      AND connamespace =(
        SELECT
          oid
        FROM
          pg_namespace
        WHERE
          nspname = 'public')) THEN
    ALTER TABLE "public"."referendum_votes"
      DROP CONSTRAINT "referendum_votes_id_key";
END IF;
END
$$;

-- Drop referendums_id_key constraint (keep referendums_pkey)
-- First need to recreate the foreign key to reference the primary key instead
DO $$
BEGIN
  -- Drop the foreign key constraint if it exists
  IF EXISTS(
    SELECT
      1
    FROM
      pg_constraint
    WHERE
      conname = 'referendum_votes_referendum_id_fkey'
      AND connamespace =(
        SELECT
          oid
        FROM
          pg_namespace
        WHERE
          nspname = 'public')) THEN
    ALTER TABLE "public"."referendum_votes"
      DROP CONSTRAINT "referendum_votes_referendum_id_fkey";
END IF;
  -- Drop the redundant unique constraint
  IF EXISTS(
    SELECT
      1
    FROM
      pg_constraint
    WHERE
      conname = 'referendums_id_key'
      AND connamespace =(
        SELECT
          oid
        FROM
          pg_namespace
        WHERE
          nspname = 'public')) THEN
    ALTER TABLE "public"."referendums"
      DROP CONSTRAINT "referendums_id_key";
END IF;
  -- Recreate the foreign key constraint to reference the primary key
  ALTER TABLE "public"."referendum_votes"
    ADD CONSTRAINT "referendum_votes_referendum_id_fkey" FOREIGN KEY("referendum_id") REFERENCES "public"."referendums"("id") ON UPDATE CASCADE ON DELETE CASCADE;
END
$$;

