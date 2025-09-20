-- Add constraint to prevent HTML tags in profile markdown field
-- This provides database-level protection against HTML injection
-- Create a function to check if text contains HTML tags
CREATE OR REPLACE FUNCTION public.contains_html_tags(input_text text)
  RETURNS boolean
  LANGUAGE plpgsql
  IMMUTABLE
  AS $$
BEGIN
  -- Return true if text contains HTML tags (angle brackets with content)
  -- This regex looks for patterns like <tag>, </tag>, <tag attr="value">
  -- But excludes email addresses and URLs in angle brackets
  RETURN input_text ~ '<[^@\s]+@[^@\s>]+>|<https?://[^>]+>|</?[a-zA-Z][^>]*>';
END;
$$;

-- Add constraint to profiles table to prevent HTML in markdown
ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "markdown_no_html_tags" CHECK (markdown IS NULL OR NOT public.contains_html_tags(markdown)) NOT VALID;

-- Validate the constraint (this will check existing data)
ALTER TABLE "public"."profiles" VALIDATE CONSTRAINT "markdown_no_html_tags";

-- Add comment to document the constraint
COMMENT ON CONSTRAINT "markdown_no_html_tags" ON "public"."profiles" IS 'Prevents HTML tags in markdown content for security';

