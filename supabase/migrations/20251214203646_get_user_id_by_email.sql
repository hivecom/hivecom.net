-- Create a secure function to look up User ID by Email
-- SECURITY DEFINER allows this function to read auth.users even if the client can't
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email text)
RETURNS table (id uuid) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth -- Secure search path
AS $$
BEGIN
  RETURN QUERY
  SELECT au.id
  FROM auth.users au
  WHERE lower(au.email) = lower(get_user_id_by_email.email);
END;
$$;

-- Revoke public access so random clients can't scrape IDs
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM authenticated;

-- Grant access ONLY to the service_role (which our Edge Function uses)
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
