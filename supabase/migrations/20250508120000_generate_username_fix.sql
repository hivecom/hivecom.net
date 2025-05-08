-- Fix the generate_username function to ensure it always returns a value
CREATE OR REPLACE FUNCTION "public"."generate_username"()
  RETURNS text
  LANGUAGE "plpgsql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
DECLARE
  base_username TEXT := 'User';
  new_username TEXT;
  counter INTEGER;
BEGIN
  -- Start with the total count of User% usernames + 1
  counter := (SELECT COUNT(*) FROM public.profiles WHERE username LIKE 'User%') + 1;

  -- Keep incrementing counter until we find an unused username
  LOOP
    new_username := base_username || counter;

    -- Check if this username exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = new_username) THEN
      -- Found an unused username, return it
      RETURN new_username;
    END IF;

    -- Increment counter and try again
    counter := counter + 1;
  END LOOP;
END;
$$;

