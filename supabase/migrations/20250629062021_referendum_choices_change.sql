-- Migration: Delete votes when referendum choices are removed
-- This ensures data integrity by removing votes that may reference invalid choice indices

-- Create a function to delete votes when choices are removed
CREATE OR REPLACE FUNCTION delete_votes_on_choices_removal()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if choices have been removed (new array is shorter or missing elements)
  -- This allows adding new choices but triggers on removal
  IF array_length(OLD.choices, 1) > array_length(NEW.choices, 1) OR
     NOT (OLD.choices <@ NEW.choices) THEN -- Check if all old choices are still present in new choices
    
    -- Delete all votes for this referendum
    DELETE FROM referendum_votes 
    WHERE referendum_id = NEW.id;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS referendum_choices_change_trigger ON referendums;

CREATE TRIGGER referendum_choices_removal_trigger
  AFTER UPDATE ON referendums
  FOR EACH ROW
  EXECUTE FUNCTION delete_votes_on_choices_removal();

-- Add a comment explaining the trigger
COMMENT ON TRIGGER referendum_choices_removal_trigger ON referendums IS 
'Automatically deletes all votes for a referendum when choices are removed (but allows adding new choices) to maintain data integrity';

COMMENT ON FUNCTION delete_votes_on_choices_removal() IS 
'Function that deletes referendum votes when choices are removed. Allows adding new choices without affecting votes.';