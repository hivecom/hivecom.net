ALTER TABLE "public"."events"
  ALTER COLUMN "date" SET data TYPE timestamp with time zone USING "date"::timestamp with time zone;

