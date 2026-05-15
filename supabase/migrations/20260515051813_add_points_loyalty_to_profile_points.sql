-- Add points_loyalty column to profile_points
ALTER TABLE "public"."profile_points"
  ADD COLUMN "points_loyalty" integer NOT NULL DEFAULT 0;

-- Recreate points_total generated column to include points_loyalty
ALTER TABLE "public"."profile_points" DROP COLUMN "points_total";

ALTER TABLE "public"."profile_points"
  ADD COLUMN "points_total" integer GENERATED ALWAYS AS (points_donations + points_patreon + points_loyalty - points_spent) STORED;
