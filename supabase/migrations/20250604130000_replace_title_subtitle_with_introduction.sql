-- Replace title and subtitle fields with a single introduction field
-- This migration consolidates the title and subtitle fields into a single introduction field with a 128 character limit
-- First, add the new introduction column
ALTER TABLE "public"."profiles"
  ADD COLUMN "introduction" text;

-- Add a constraint to limit introduction to 128 characters
ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "introduction_length_limit" CHECK (LENGTH(introduction) <= 128);

-- Migrate existing data by combining title and subtitle
-- Priority: If both exist, combine as "title: subtitle"
-- If only one exists, use that one
-- If neither exists, leave null
UPDATE
  "public"."profiles"
SET
  "introduction" = CASE WHEN title IS NOT NULL
    AND subtitle IS NOT NULL THEN
    CASE WHEN LENGTH(title || ': ' || subtitle) <= 128 THEN
      title || ': ' || subtitle
    ELSE
    LEFT (title || ': ' || subtitle,
      128)
    END
  WHEN title IS NOT NULL THEN
    CASE WHEN LENGTH(title) <= 128 THEN
      title
    ELSE
    LEFT (title,
      128)
    END
  WHEN subtitle IS NOT NULL THEN
    CASE WHEN LENGTH(subtitle) <= 128 THEN
      subtitle
    ELSE
    LEFT (subtitle,
      128)
    END
  ELSE
    NULL
  END;

-- Drop the old title and subtitle columns
ALTER TABLE "public"."profiles"
  DROP COLUMN "title",
  DROP COLUMN "subtitle";

