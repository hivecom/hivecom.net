-- List members whose profile email flags are set, so the admin suppression
-- view can union them with the SES suppression list. Without this, a profile
-- flagged by a DeliveryDelay (which never creates an SES suppression entry)
-- is invisible in the admin UI.
-- SECURITY DEFINER because the emails live in auth.users, which the client
-- can't read.
CREATE OR REPLACE FUNCTION public.get_flagged_email_profiles()
RETURNS table (
  id uuid,
  email text,
  username text,
  email_notifications_bounced boolean,
  email_notifications_disabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    lower(au.email),
    p.username,
    p.email_notifications_bounced,
    p.email_notifications_disabled
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE p.email_notifications_bounced OR p.email_notifications_disabled;
END;
$$;

-- This exposes member emails, so only the service role (edge functions) may
-- call it. Revoking from PUBLIC too, since anon/authenticated inherit it.
REVOKE EXECUTE ON FUNCTION public.get_flagged_email_profiles() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_flagged_email_profiles() TO service_role;
