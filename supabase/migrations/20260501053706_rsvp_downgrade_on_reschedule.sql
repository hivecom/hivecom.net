-- Drop existing trigger before replacing function
DROP TRIGGER IF EXISTS reset_event_rsvps_on_date_change_trigger ON public.events;

-- Replace function: downgrade 'yes' RSVPs to 'tentative' and notify affected users
CREATE OR REPLACE FUNCTION public.reset_event_rsvps_on_date_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.date IS DISTINCT FROM NEW.date THEN
    -- Capture affected users (those with 'yes') before updating
    WITH affected_users AS (
      UPDATE public.events_rsvps
      SET rsvp = 'tentative'
      WHERE event_id = NEW.id
        AND rsvp = 'yes'
      RETURNING user_id
    )
    INSERT INTO public.notifications (user_id, title, body, href, source, source_id)
    SELECT
      user_id,
      NEW.title || ' was rescheduled',
      'Your RSVP was changed to tentative.',
      '/events/' || NEW.id,
      'event_rescheduled',
      NEW.id::text
    FROM affected_users
    ON CONFLICT (user_id, source, source_id) WHERE source IS NOT NULL AND source_id IS NOT NULL
    DO UPDATE SET
      title      = EXCLUDED.title,
      body       = EXCLUDED.body,
      href       = EXCLUDED.href,
      is_read    = false,
      modified_at = now();
  END IF;
  RETURN NEW;
END;
$function$;

-- Re-create trigger with same name
CREATE TRIGGER reset_event_rsvps_on_date_change_trigger
  AFTER UPDATE OF date ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_event_rsvps_on_date_change();

-- Update comment
COMMENT ON FUNCTION public.reset_event_rsvps_on_date_change() IS 'When an event date changes, downgrades yes RSVPs to tentative and sends a notification to each affected user';
