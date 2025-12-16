-- Drop prior authenticated-read policy so only anon policy remains
DROP POLICY IF EXISTS "Users can SELECT events_rsvps" ON public.events_rsvps;

-- Allow anonymous users to read event RSVPs (public view access)
CREATE POLICY "Everyone can SELECT events_rsvps" ON public.events_rsvps
  FOR SELECT TO anon, authenticated
    USING (TRUE);

