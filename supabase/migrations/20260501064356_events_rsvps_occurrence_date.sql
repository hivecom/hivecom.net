-- Add occurrence_date to events_rsvps to anchor occurrence-scoped RSVPs to a
-- specific computed occurrence date. NULL for series-scoped RSVPs and one-off events.
-- Without this column there is no way to distinguish which occurrence of a
-- recurring event a given occurrence-scoped RSVP belongs to, since recurring
-- events are a single row - the frontend computes occurrence dates client-side
-- from the recurrence_rule and never writes child rows.

ALTER TABLE public.events_rsvps
  ADD COLUMN occurrence_date timestamptz NULL;

COMMENT ON COLUMN public.events_rsvps.occurrence_date IS
  'For occurrence-scoped RSVPs on recurring events: the specific computed occurrence date this RSVP applies to. NULL for series-scoped RSVPs and RSVPs on one-off events.';

-- Drop old unique constraint and replace with one that includes occurrence_date.
-- NULLS NOT DISTINCT means two NULLs are considered equal, preserving the
-- one-RSVP-per-user-per-event-per-scope rule for non-recurring events.
ALTER TABLE public.events_rsvps
  DROP CONSTRAINT events_rsvps_user_event_scope_key;

ALTER TABLE public.events_rsvps
  ADD CONSTRAINT events_rsvps_user_event_scope_occurrence_key
    UNIQUE NULLS NOT DISTINCT (user_id, event_id, scope, occurrence_date);
