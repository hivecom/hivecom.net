-- Add bounce flag to profiles for email deliverability management
ALTER TABLE public.profiles
	ADD COLUMN IF NOT EXISTS email_notifications_bounced boolean NOT NULL DEFAULT FALSE,
	ADD COLUMN IF NOT EXISTS email_notifications_disabled boolean NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION get_user_id_by_email(email TEXT)
RETURNS TABLE (id uuid)
SECURITY definer
AS $$
BEGIN
  RETURN QUERY SELECT au.id FROM auth.users au WHERE au.email = $1;
END;
$$ LANGUAGE plpgsql;
