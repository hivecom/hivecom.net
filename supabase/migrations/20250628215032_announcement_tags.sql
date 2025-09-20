-- Add tags column to announcements table
ALTER TABLE announcements
  ADD COLUMN tags text[];

-- Add github column to projects table
ALTER TABLE projects
  ADD COLUMN github text;

-- Create a function to validate tag format (lowercase, hyphens instead of spaces)
CREATE OR REPLACE FUNCTION validate_tag_format(tag text)
  RETURNS boolean
  AS $$
BEGIN
  -- Check if tag is lowercase and uses hyphens instead of spaces
  -- Allow letters, numbers, hyphens, and underscores
  RETURN tag ~ '^[a-z0-9_-]+$'
    AND CHAR_LENGTH(tag) > 0;
END;
$$
LANGUAGE plpgsql
IMMUTABLE;

-- Create a function to validate GitHub repository format (username/repository)
CREATE OR REPLACE FUNCTION validate_github_repo(github_repo text)
  RETURNS boolean
  AS $$
BEGIN
  -- Check if github_repo follows the username/repository format
  -- Username and repository can contain letters, numbers, hyphens, underscores, and dots
  -- Username: 1-39 characters, no consecutive hyphens, cannot start/end with hyphen
  -- Repository: 1-100 characters
  RETURN github_repo ~ '^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?/[a-zA-Z0-9._-]+$'
    AND CHAR_LENGTH(github_repo) <= 140 -- Max length for username/repo combined
    AND CHAR_LENGTH(SPLIT_PART(github_repo, '/', 1)) <= 39 -- Max username length
    AND CHAR_LENGTH(SPLIT_PART(github_repo, '/', 2)) <= 100;
  -- Max repository length
END;
$$
LANGUAGE plpgsql
IMMUTABLE;

-- Create a function to validate all tags in an array
CREATE OR REPLACE FUNCTION validate_tags_array(tags text[])
  RETURNS boolean
  AS $$
DECLARE
  tag text;
BEGIN
  -- Return true if tags is null or empty
  IF tags IS NULL OR ARRAY_LENGTH(tags, 1) IS NULL THEN
    RETURN TRUE;
  END IF;
  -- Check each tag in the array
  FOREACH tag IN ARRAY tags LOOP
    IF NOT validate_tag_format(tag) THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  RETURN TRUE;
END;
$$
LANGUAGE plpgsql
IMMUTABLE;

-- Add check constraints for tag format on both tables
ALTER TABLE announcements
  ADD CONSTRAINT announcements_tags_format_check CHECK (validate_tags_array(tags));

ALTER TABLE projects
  ADD CONSTRAINT projects_tags_format_check CHECK (validate_tags_array(tags));

-- Add check constraint for GitHub repository format
ALTER TABLE projects
  ADD CONSTRAINT projects_github_format_check CHECK (github IS NULL OR validate_github_repo(github));

-- Create indexes for better tag search performance
CREATE INDEX IF NOT EXISTS idx_announcements_tags ON announcements USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_projects_tags ON projects USING GIN(tags);

-- Add comments for documentation
COMMENT ON COLUMN announcements.tags IS 'Array of tags for categorizing announcements. Tags must be lowercase with hyphens instead of spaces.';

COMMENT ON COLUMN projects.tags IS 'Array of tags for categorizing projects. Tags must be lowercase with hyphens instead of spaces.';

COMMENT ON COLUMN projects.github IS 'GitHub repository in the format "username/repository". Must follow GitHub naming conventions.';

COMMENT ON FUNCTION validate_tag_format(text) IS 'Validates that a single tag follows the required format: lowercase letters, numbers, hyphens, and underscores only.';

COMMENT ON FUNCTION validate_tags_array(text[]) IS 'Validates that all tags in an array follow the required format.';

COMMENT ON FUNCTION validate_github_repo(text) IS 'Validates that a GitHub repository follows the username/repository format with proper GitHub naming conventions.';

