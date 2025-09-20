-- Fix misspelled column name 'admininstrator' to 'administrator' in gameservers table
-- Drop the existing foreign key constraint
ALTER TABLE "public"."gameservers"
  DROP CONSTRAINT "gameservers_admininstrator_fkey";

-- Rename the column from 'admininstrator' to 'administrator'
ALTER TABLE "public"."gameservers" RENAME COLUMN "admininstrator" TO "administrator";

-- Recreate the foreign key constraint with the correct column name
ALTER TABLE "public"."gameservers"
  ADD CONSTRAINT "gameservers_administrator_fkey" FOREIGN KEY (administrator) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL NOT valid;

-- Validate the new constraint
ALTER TABLE "public"."gameservers" validate CONSTRAINT "gameservers_administrator_fkey";

