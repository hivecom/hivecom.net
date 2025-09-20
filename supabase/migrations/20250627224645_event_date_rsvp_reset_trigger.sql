-- Create a trigger function to delete RSVPs when event date changes
CREATE OR REPLACE FUNCTION public.reset_event_rsvps_on_date_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
  -- Only proceed if this is an UPDATE operation and the date has actually changed
  IF TG_OP = 'UPDATE' AND OLD.date IS DISTINCT FROM NEW.date THEN
    -- Delete all RSVPs for this event
    DELETE FROM public.events_rsvps
    WHERE event_id = NEW.id;
    -- Log the action (optional, but helpful for debugging)
    RAISE NOTICE 'Event date changed for event ID %, deleted % RSVPs', NEW.id,(
      SELECT
        COUNT(*)
      FROM
        public.events_rsvps
      WHERE
        event_id = NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Create the trigger on the events table
CREATE TRIGGER reset_event_rsvps_on_date_change_trigger
  AFTER UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_event_rsvps_on_date_change();

-- Add a comment to document the trigger's purpose
COMMENT ON FUNCTION public.reset_event_rsvps_on_date_change() IS 'Automatically deletes all RSVPs when an event date is changed, as the date change essentially makes it a different event';

