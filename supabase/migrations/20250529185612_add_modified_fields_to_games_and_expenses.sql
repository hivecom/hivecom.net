-- Add modified_at and modified_by fields to games and expenses tables
-- Add modified_at and modified_by to games table
ALTER TABLE "public"."games"
  ADD COLUMN "modified_at" timestamptz,
  ADD COLUMN "modified_by" uuid;

-- Add foreign key constraint for modified_by in games table
ALTER TABLE "public"."games"
  ADD CONSTRAINT "games_modified_by_fkey" FOREIGN KEY (modified_by) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Add modified_at to expenses table (modified_by already exists)
ALTER TABLE "public"."expenses"
  ADD COLUMN "modified_at" timestamptz;

