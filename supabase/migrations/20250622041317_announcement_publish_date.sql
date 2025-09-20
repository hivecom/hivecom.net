-- Add published_at column to announcements table
ALTER TABLE "public"."announcements"
  ADD COLUMN "published_at" timestamp with time zone NOT NULL DEFAULT NOW();

-- Create index for efficient queries on published_at
CREATE INDEX IF NOT EXISTS "idx_announcements_published_at" ON "public"."announcements"("published_at");

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Everyone can SELECT announcements" ON "public"."announcements";

-- Create new SELECT policy for users with announcements.read permission (can see all)
CREATE POLICY "Allow authorized roles to SELECT all announcements" ON "public"."announcements"
  FOR SELECT TO authenticated
    USING (public.has_permission('announcements.read'::public.app_permission));

-- Create policy for all users (authenticated and anonymous) to see published announcements
CREATE POLICY "Everyone can SELECT published announcements" ON "public"."announcements"
  FOR SELECT TO authenticated, anon
    USING (published_at <= NOW());

