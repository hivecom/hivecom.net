-- Remove icon_hash column from data_steam_games.
-- The column was added under the false assumption that the Steam GetPlayerSummaries
-- API returns a gameicon field. It does not. The column will never populate.

ALTER TABLE public.data_steam_games
  DROP COLUMN IF EXISTS icon_hash;

-- Revert trigger to original - no icon_hash logic
CREATE OR REPLACE FUNCTION public.upsert_data_steam_game()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
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

  INSERT INTO public.data_steam_games (steam_id, name, updated_at)
  VALUES (NEW.current_app_id, NEW.current_app_name, now())
  ON CONFLICT (steam_id)
  DO UPDATE SET
    name       = EXCLUDED.name,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;
