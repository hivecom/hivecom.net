-- RSVPs are not public - revoke anon access from RSVP query functions.
-- Badge recompute functions should be internal (service_role / trigger) only -
-- revoke from anon and authenticated to prevent arbitrary recompute calls.

-- ---------------------------------------------------------------------------
-- RSVP functions: revoke anon
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.get_effective_rsvp(uuid, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_rsvps_for_occurrence(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_rsvps_for_occurrence(bigint, timestamptz) FROM anon;

-- ---------------------------------------------------------------------------
-- Badge recompute functions: revoke anon and authenticated
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.recompute_all_profile_badges(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_chatterbox_badge(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_forum_regular_badge(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_one_of_us_badge(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_party_animal_badge(uuid) FROM anon, authenticated;
