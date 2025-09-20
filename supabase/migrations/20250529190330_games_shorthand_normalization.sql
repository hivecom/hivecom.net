-- Add constraint to ensure game shorthand is lowercase with no spaces
-- This ensures shorthand is always consistent and validates the format

-- Add check constraint to validate shorthand format
ALTER TABLE games 
ADD CONSTRAINT games_shorthand_format_check 
CHECK (
  shorthand IS NULL OR (
    shorthand = LOWER(shorthand) AND 
    shorthand !~ '\s' AND 
    LENGTH(shorthand) > 0
  )
);
