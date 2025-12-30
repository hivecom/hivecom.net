-- Create enum for Steam presence status
DO $$
BEGIN
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_type t
    WHERE
      t.typname = 'presence_steam_status'
      AND t.typnamespace = 'public'::regnamespace) THEN
  CREATE TYPE public.presence_steam_status AS ENUM(
    'offline',
    'online',
    'busy',
    'away',
    'snooze',
    'looking_to_trade',
    'looking_to_play'
);
END IF;
END
$$;

-- Convert status column from text to enum
ALTER TABLE public.presences_steam
  ALTER COLUMN status TYPE public.presence_steam_status
  USING status::public.presence_steam_status;

-- Add visibility and steam_name columns to presences_steam
ALTER TABLE public.presences_steam
  ADD COLUMN IF NOT EXISTS visibility text,
  ADD COLUMN IF NOT EXISTS steam_name text;

COMMENT ON COLUMN public.presences_steam.status IS 'Steam online status: offline, online, busy, away, snooze, looking_to_trade, looking_to_play';

COMMENT ON COLUMN public.presences_steam.visibility IS 'Profile visibility state: private, friends_only, or public';

COMMENT ON COLUMN public.presences_steam.steam_name IS 'Steam persona/display name';

