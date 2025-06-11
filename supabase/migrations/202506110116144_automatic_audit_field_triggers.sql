-- Create triggers to automatically update modified_at and modified_by fields on UPDATE
-- This ensures audit fields are always updated consistently without relying on application code
-- Create a generic function to update audit fields
CREATE OR REPLACE FUNCTION public.update_audit_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
  -- Only update if this is an UPDATE operation
  IF TG_OP = 'UPDATE' THEN
    -- Set modified_at to current timestamp (if column exists)
    BEGIN
      NEW.modified_at = NOW();
    EXCEPTION
      WHEN undefined_column THEN
        -- Column doesn't exist, skip
    END;
    -- Set modified_by to current authenticated user (if column exists)
    BEGIN
      NEW.modified_by = auth.uid();
    EXCEPTION
      WHEN undefined_column THEN
        -- Column doesn't exist, skip
    END;
    -- Ensure created_at is never changed during updates (if column exists)
    BEGIN
      NEW.created_at = OLD.created_at;
    EXCEPTION
      WHEN undefined_column THEN
        -- Column doesn't exist, skip
    END;
    -- Ensure created_by is never changed during updates (if column exists)
    BEGIN
      NEW.created_by = OLD.created_by;
    EXCEPTION
      WHEN undefined_column THEN
        -- Column doesn't exist, skip
    END;
END IF;
RETURN NEW;
END;

$function$;

-- Create triggers for all tables with audit fields
-- These triggers will fire BEFORE UPDATE to modify the NEW record
-- Trigger for announcements table
CREATE TRIGGER update_announcements_audit_fields
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

-- Trigger for events table
CREATE TRIGGER update_events_audit_fields
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

-- Trigger for expenses table
CREATE TRIGGER update_expenses_audit_fields
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

-- Trigger for games table
CREATE TRIGGER update_games_audit_fields
  BEFORE UPDATE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

-- Trigger for gameservers table
CREATE TRIGGER update_gameservers_audit_fields
  BEFORE UPDATE ON public.gameservers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

-- Trigger for profiles table
CREATE TRIGGER update_profiles_audit_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

-- Trigger for referendums table
CREATE TRIGGER update_referendums_audit_fields
  BEFORE UPDATE ON public.referendums
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

-- Trigger for referendum_votes table
CREATE TRIGGER update_referendum_votes_audit_fields
  BEFORE UPDATE ON public.referendum_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

-- Trigger for servers table
CREATE TRIGGER update_servers_audit_fields
  BEFORE UPDATE ON public.servers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.update_audit_fields() TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_audit_fields() TO service_role;

