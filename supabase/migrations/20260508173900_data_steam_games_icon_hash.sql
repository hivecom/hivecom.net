-- Add icon_hash column to data_steam_games so we can build the Steam client icon URL.
-- The hash is sourced from the Steam GetPlayerSummaries API (gameicon field),
-- already stored in presences_steam.details->>'game_icon' by worker-sync-steam.
-- The trigger is updated to also persist it when present.

ALTER TABLE public.data_steam_games
  ADD COLUMN icon_hash text;

COMMENT ON COLUMN public.data_steam_games.icon_hash IS 'Steam client icon hash (from GetPlayerSummaries gameicon field). Build URL as: https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/{steam_id}/{icon_hash}.jpg';

-- Update trigger to also capture icon_hash from presences_steam.details
CREATE OR REPLACE FUNCTION public.upsert_data_steam_game()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_icon_hash text;
BEGIN
  -- Only proceed when we have both an app ID and name
  IF NEW.current_app_id IS NULL OR NEW.current_app_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only track games for users who have opted into rich presence
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.profile_id
      AND rich_presence_enabled = TRUE
  ) THEN
    RETURN NEW;
  END IF;

  -- Extract icon hash from details JSON if present
  v_icon_hash := NEW.details->>'game_icon';

  INSERT INTO public.data_steam_games (steam_id, name, icon_hash, updated_at)
  VALUES (NEW.current_app_id, NEW.current_app_name, v_icon_hash, now())
  ON CONFLICT (steam_id)
  DO UPDATE SET
    name       = EXCLUDED.name,
    icon_hash  = COALESCE(EXCLUDED.icon_hash, public.data_steam_games.icon_hash),
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;
