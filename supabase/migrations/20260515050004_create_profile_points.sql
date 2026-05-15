-- Create profile_points table
CREATE TABLE "public"."profile_points"(
  "profile_id" uuid NOT NULL,
  "points_donations" integer NOT NULL DEFAULT 0,
  "points_patreon" integer NOT NULL DEFAULT 0,
  "points_spent" integer NOT NULL DEFAULT 0,
  "points_total" integer GENERATED ALWAYS AS (points_donations + points_patreon - points_spent) STORED,
  "public" boolean NOT NULL DEFAULT TRUE,
  "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
  "modified_at" timestamp with time zone
);

COMMENT ON TABLE "public"."profile_points" IS 'Per-user points tracking for community contributions and engagement';

-- Enable RLS on profile_points table
ALTER TABLE "public"."profile_points" ENABLE ROW LEVEL SECURITY;

-- Create primary key for profile_points
CREATE UNIQUE INDEX profile_points_pkey ON public.profile_points USING btree(profile_id);

ALTER TABLE "public"."profile_points"
  ADD CONSTRAINT "profile_points_pkey" PRIMARY KEY USING INDEX "profile_points_pkey";

-- Add foreign key constraints for profile_points
ALTER TABLE "public"."profile_points"
  ADD CONSTRAINT "profile_points_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;

ALTER TABLE "public"."profile_points" VALIDATE CONSTRAINT "profile_points_profile_id_fkey";

-- Grant permissions on profile_points table
GRANT SELECT ON TABLE "public"."profile_points" TO "anon";

GRANT SELECT ON TABLE "public"."profile_points" TO "authenticated";

GRANT ALL ON TABLE "public"."profile_points" TO "service_role";

-- Add RLS policies for profile_points table
-- Authenticated users can read public rows or their own
CREATE POLICY "Authenticated users can read public or own profile_points" ON "public"."profile_points"
  FOR SELECT TO authenticated
    USING ("public" = TRUE OR public.is_owner(profile_id));

-- Anon users can only read public rows
CREATE POLICY "Anon users can read public profile_points" ON "public"."profile_points"
  FOR SELECT TO anon
    USING ("public" = TRUE);

-- Users can update own profile_points visibility
CREATE POLICY "Users can update own profile_points visibility" ON "public"."profile_points"
  FOR UPDATE TO authenticated
    USING (public.is_owner(profile_id))
    WITH CHECK (public.is_owner(profile_id));
